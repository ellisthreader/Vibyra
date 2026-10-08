//! The CDP event policy, answered at once on the pump thread: every request
//! is checked (origin, method, popups), new pages opened by automation are
//! closed, every frame and worker gets the page guard (no sockets) before its
//! first line of code, sockets that exist anyway are counted, dialogs are
//! dismissed and file choosers (uploads) are never answered.

use super::cdp::Handler;
use super::policy::{Mode, Policy};
use super::session::Shared;
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use std::sync::Arc;

pub(crate) const GUARD: &str = include_str!("agent_v2_browser_guard.js");

/// Attach to every related target paused, so its guard runs before its first line.
pub(crate) fn attach() -> Value {
    json!({"autoAttach": true, "waitForDebuggerOnStart": true, "flatten": true})
}

#[cfg(test)]
#[path = "agent_v2_browser_events_tests.rs"]
mod tests;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum Kind {
    Page,
    Frame,
    Worker,
}

type Emit<'a> = &'a mut dyn FnMut(&str, Value, Option<&str>);

/// What a newly attached target needs before it runs any code of its own.
/// Commands on one session run in order, so the guard is in place when it resumes.
fn setup(send: Emit, session: &str, kind: Kind) {
    if kind == Kind::Worker {
        send(
            "Runtime.evaluate",
            json!({"expression": GUARD}),
            Some(session),
        );
    } else {
        send("Page.enable", json!({}), Some(session));
        let guard = json!({"source": GUARD, "runImmediately": true});
        send(
            "Page.addScriptToEvaluateOnNewDocument",
            guard,
            Some(session),
        );
    }
    if kind == Kind::Page {
        let chooser = json!({"enabled": true});
        send("Page.setInterceptFileChooserDialog", chooser, Some(session));
    }
    send("Network.enable", json!({}), Some(session));
    send("Target.setAutoAttach", attach(), Some(session));
    send("Runtime.runIfWaitingForDebugger", json!({}), Some(session));
}

fn attached(send: Emit, params: &Value, policy: &Policy, shared: &Shared) {
    let child = params["sessionId"].as_str().unwrap_or_default();
    let target = params["targetInfo"]["targetId"]
        .as_str()
        .unwrap_or_default();
    match params["targetInfo"]["type"].as_str() {
        Some("page") => {}
        Some("iframe") => {
            // A frame that was not held for us may already have run its scripts (and
            // opened a socket the guard never saw): it cannot be vouched for.
            if params["waitingForDebugger"] != true {
                shared.unverified(child);
                policy.note_blocked("a frame that started before the browser guard".into());
            }
            return setup(send, child, Kind::Frame);
        }
        _ => return setup(send, child, Kind::Worker),
    }
    let mut main = shared.main.lock().unwrap();
    match main.as_ref() {
        None => *main = Some((target.to_owned(), child.to_owned())),
        Some((id, _)) if *id == target => {}
        Some(_) if policy.mode() == Mode::Takeover => setup(send, child, Kind::Page),
        Some(_) => {
            shared.popups.fetch_add(1, Ordering::SeqCst);
            policy.note_blocked("a popup window (closed)".into());
            // Let it start (a paused popup stalls its opener) with every
            // request failing, then close it.
            shared.closing.lock().unwrap().insert(target.to_owned());
            send("Runtime.runIfWaitingForDebugger", json!({}), Some(child));
            send("Target.closeTarget", json!({"targetId": target}), None);
        }
    }
}

fn paused(send: Emit, params: &Value, session: Option<&str>, policy: &Policy, shared: &Shared) {
    let request = &params["request"];
    let (url, method) = (
        request["url"].as_str().unwrap_or(""),
        request["method"].as_str().unwrap_or("GET"),
    );
    let id = params["requestId"].clone();
    // A popup's main frame id is its target id: everything it asks for fails.
    let closing = params["frameId"]
        .as_str()
        .is_some_and(|f| shared.closing.lock().unwrap().contains(f));
    let verdict = if closing {
        Err("popup")
    } else {
        policy.request(url, method)
    };
    match verdict {
        Ok(()) => {
            if policy.mode() == Mode::Submit {
                let network = params["networkId"].as_str().or(id.as_str());
                let kind = params["resourceType"].as_str().unwrap_or("Other");
                policy
                    .sent
                    .record(network.unwrap_or_default(), method, url, kind);
            }
            send("Fetch.continueRequest", json!({"requestId": id}), session)
        }
        Err(_) => send(
            "Fetch.failRequest",
            json!({"requestId": id, "errorReason": "BlockedByClient"}),
            session,
        ),
    }
}

pub(crate) fn handler(policy: Arc<Policy>, shared: Arc<Shared>) -> Handler {
    Box::new(move |event, send| {
        let params = &event["params"];
        let session = event["sessionId"].as_str();
        let id = params["requestId"].as_str().unwrap_or_default();
        match event["method"].as_str().unwrap_or_default() {
            "Fetch.requestPaused" => paused(send, params, session, &policy, &shared),
            "Target.targetCreated"
                if params["targetInfo"]["openerId"].is_string()
                    && policy.mode() != Mode::Takeover =>
            {
                let target = params["targetInfo"]["targetId"]
                    .as_str()
                    .unwrap_or_default();
                shared.closing.lock().unwrap().insert(target.to_owned());
            }
            "Target.attachedToTarget" => attached(send, params, &policy, &shared),
            "Target.detachedFromTarget" => {
                let gone = params["sessionId"].as_str().unwrap_or_default();
                shared.sockets.lock().unwrap().retain(|(s, _)| s != gone);
            }
            "Network.webSocketCreated" => {
                let key = (session.unwrap_or_default().to_owned(), id.to_owned());
                shared.sockets.lock().unwrap().insert(key);
                policy.note_blocked("a live connection (WebSocket) on the page".into());
            }
            "Network.webSocketClosed" => {
                let key = (session.unwrap_or_default().to_owned(), id.to_owned());
                shared.sockets.lock().unwrap().remove(&key);
            }
            "Network.responseReceived" => {
                let status = params["response"]["status"].as_u64().unwrap_or(0);
                policy.sent.status(id, status as u16);
            }
            "Network.loadingFailed" => policy.sent.failed(id),
            // A new document replaces the old one's sockets.
            "Page.frameNavigated" if params["frame"]["parentId"].is_null() => {
                let page = session.unwrap_or_default();
                shared.sockets.lock().unwrap().retain(|(s, _)| s != page);
            }
            "Page.javascriptDialogOpening" if policy.mode() != Mode::Takeover => {
                shared.dialogs.fetch_add(1, Ordering::SeqCst);
                send(
                    "Page.handleJavaScriptDialog",
                    json!({"accept": false}),
                    session,
                );
            }
            "Page.fileChooserOpened" => {
                shared.choosers.fetch_add(1, Ordering::SeqCst);
                policy.note_blocked("a file upload (uploads are not allowed)".into());
            }
            _ => {}
        }
    })
}
