//! Running one claimed browser action: open (or reuse) the run's session in
//! the grant's private profile, apply the grant's current sites, dispatch the
//! tool, and shape the receipt the backend validates.

use super::session::{self, refuse, Refusal, Session};
use super::{chrome, policy, takeover, url_clean, Holder, Slot, TAKEOVER_LIMIT};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub(crate) fn receipt(result: Result<Value, Refusal>) -> Value {
    match result {
        Ok(mut value) => {
            // Second line of defence: no fragment, credential or token leaves the Mac.
            url_clean::scrub(&mut value);
            value
        }
        Err(e) => {
            let mut out = json!({"error": e.message.chars().take(480).collect::<String>(), "reason": e.reason});
            if e.unknown {
                out["unknown"] = json!(true);
            }
            out
        }
    }
}

/// `<settings>/agent-browser/<account hash>/<connection>`: partitioned by Vibyra account and grant.
fn profile(app: &AppHandle, connection: &str) -> Result<std::path::PathBuf, Refusal> {
    let state = app.state::<crate::state::AppState>();
    let scope = crate::agent_computer_access::account_scope(&state)?;
    if !crate::agent_computer_access::looks_uuid(connection) {
        return Err(refuse("refused", "Invalid browser grant."));
    }
    let digest = <sha2::Sha256 as sha2::Digest>::digest(scope.as_bytes());
    let account: String = digest.iter().take(8).map(|b| format!("{b:02x}")).collect();
    let dir = state
        .settings_path
        .parent()
        .ok_or_else(|| refuse("unavailable", "No Vibyra settings directory"))?;
    Ok(dir.join("agent-browser").join(account).join(connection))
}

pub(super) fn execute(app: &AppHandle, slot: &Slot, run: &str, action: &Value) -> Value {
    let connection = action["browser"]["connectionId"]
        .as_str()
        .unwrap_or_default();
    let origins: Vec<String> = action["browser"]["origins"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|o| o.as_str().map(str::to_owned))
        .collect();
    let mut guard = slot.lock().unwrap_or_else(|p| p.into_inner());
    if guard.as_ref().is_some_and(|h| h.connection != connection) {
        *guard = None; // Another grant: never reuse its profile.
    }
    if guard.is_none() {
        let launched = (|| {
            let binary = chrome::find().ok_or_else(|| {
                refuse("unavailable", "Install Google Chrome to use browser tools.")
            })?;
            let options = session::Options {
                binary,
                profile: profile(app, connection)?,
                owner: run.to_owned(),
                headless: false,
            };
            Session::launch(&options, policy::Policy::new(&origins))
        })();
        match launched {
            Ok(session) => {
                *guard = Some(Holder {
                    connection: connection.to_owned(),
                    session,
                })
            }
            Err(e) => return receipt(Err(e)),
        }
    }
    let session = &mut guard.as_mut().expect("launched").session;
    session.policy.set_origins(&origins);
    receipt(run_tool(Some(app), session, run, action))
}

pub(crate) fn run_tool(
    app: Option<&AppHandle>,
    s: &mut Session,
    run: &str,
    action: &Value,
) -> Result<Value, Refusal> {
    let args = &action["arguments"];
    let text = |key: &str| args[key].as_str().unwrap_or_default().to_owned();
    match action["tool"].as_str().unwrap_or_default() {
        "browser_open" => s.open(&text("url")),
        "browser_snapshot" => s.snapshot(),
        "browser_click" => s.click(&text("ref")),
        "browser_type" => s.type_text(&text("ref"), &text("text")),
        "browser_read" => s.read(args["startChar"].as_u64().unwrap_or(0)),
        "browser_submit" => s.submit(args),
        "browser_takeover_request" => {
            let url = s.eval("state", json!({}))?["url"]
                .as_str()
                .and_then(policy::origin_of)
                .unwrap_or_default();
            s.takeover()?;
            takeover::begin(
                app,
                run,
                action["id"].as_str().unwrap_or_default(),
                &text("reason"),
                &url,
            );
            let outcome = takeover::wait(run, TAKEOVER_LIMIT, || s.show());
            takeover::end(app, run);
            s.resume();
            outcome.map_err(|m| refuse("timeout", m))?;
            s.snapshot()
        }
        _ => Err(refuse("refused", "Unknown browser tool.")),
    }
}
