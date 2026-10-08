//! First-time setup of a launched browser. It fails closed: if the guard
//! (no sockets in any frame or worker) cannot be installed in the first page
//! before it runs anything, the session does not start.

use super::cdp::Cdp;
use super::events::{attach, GUARD};
use super::session::{refuse, Refusal, Shared};
use serde_json::json;
use std::time::{Duration, Instant};

/// Returns the first page's session id, ready and resumed.
pub(crate) fn start(cdp: &Cdp, shared: &Shared) -> Result<String, Refusal> {
    // The pipe has no readiness signal: the first command waits for Chrome to start
    // (a busy computer can take a while), later ones answer at once.
    let deny = json!({"behavior": "deny"});
    let starting = Duration::from_secs(60);
    cdp.call_for("Browser.setDownloadBehavior", deny, None, starting)?;
    // Browser-level interception covers every target, including popups and workers.
    let every = json!({"patterns": [{"urlPattern": "*"}]});
    cdp.call("Fetch.enable", every, None)?;
    cdp.call("Target.setDiscoverTargets", json!({"discover": true}), None)?;
    cdp.call("Target.setAutoAttach", attach(), None)?;
    let started = Instant::now();
    let page = loop {
        if let Some((_, session)) = shared.main.lock().unwrap().clone() {
            break session;
        }
        if started.elapsed() > Duration::from_secs(10) {
            return Err(refuse("unavailable", "The Agent browser opened no page."));
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let guard = json!({"source": GUARD, "runImmediately": true});
    for (method, params) in [
        ("Page.enable", json!({})),
        ("Page.addScriptToEvaluateOnNewDocument", guard),
        ("Network.enable", json!({})),
        // Focus and blur events fire whether or not the window is frontmost, so
        // a site's focus handlers behave (and are checked) the same headless or headed.
        (
            "Emulation.setFocusEmulationEnabled",
            json!({"enabled": true}),
        ),
        (
            "Page.setInterceptFileChooserDialog",
            json!({"enabled": true}),
        ),
        ("Target.setAutoAttach", attach()),
    ] {
        cdp.call(method, params, Some(&page))?;
    }
    let _ = cdp.call("Runtime.runIfWaitingForDebugger", json!({}), Some(&page));
    Ok(page)
}
