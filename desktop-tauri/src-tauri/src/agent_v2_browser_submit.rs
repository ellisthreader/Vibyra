//! Reading page text, and the one write: submitting exactly the approved
//! form. Unsafe requests are allowed only to the approved destination and
//! only while the submit is in flight; a changed page is refused, and the
//! receipt says `submitted` only for a request the browser was seen to make
//! (F-10): a disabled or swallowed click sent nothing, and an error answer to
//! a real POST is an unknown outcome, never a definite refusal or success.

use super::policy::{origin_of, Mode};
use super::sent::{judge, Verdict};
use super::session::{refuse, Refusal, Session};
use base64::Engine as _;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

pub(crate) fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Identity of what a submit would send: the hash of the page's whole form
/// state (`agent_v2_browser_forms.js`), which includes its address.
pub fn fingerprint(full_form_state: &str) -> String {
    sha256(full_form_state.as_bytes())
}

/// The server accepts addresses up to 2048 characters; a longer one loses its query first.
fn clip_url(url: &str) -> String {
    if url.len() <= 1900 {
        return url.to_owned();
    }
    let base = url.split('?').next().unwrap_or(url);
    base.chars().take(1900).collect()
}

impl Session {
    pub fn read(&mut self, start: u64) -> Result<Value, Refusal> {
        self.control()?;
        let mut out = self.eval("read", json!({"start": start}))?;
        let url = out["url"].as_str().unwrap_or_default();
        if url != "about:blank" && !self.policy.allows_url(url) {
            return Err(refuse(
                "origin_blocked",
                "The browser is not on an allowed site. Open one first.",
            ));
        }
        let chars = out["chars"].as_u64().unwrap_or(0);
        // Bounded by bytes too, so the receipt fits the server limit whatever the script.
        let mut text = out["text"].as_str().unwrap_or_default().to_owned();
        while text.len() > 24_000 {
            let keep = text.chars().count() * 4 / 5;
            text = text.chars().take(keep).collect();
        }
        let end = start + text.chars().count() as u64;
        out["text"] = json!(text);
        out["truncated"] = json!(end < chars);
        if end < chars {
            out["nextStartChar"] = json!(end);
        }
        Ok(out)
    }

    /// The site's answers can land just after the page settles.
    fn await_answers(&self, destination: &str, method: &str) {
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(2) {
            match judge(destination, method, &self.policy.sent.entries()) {
                Verdict::Unknown {
                    reason: "timeout", ..
                } => std::thread::sleep(Duration::from_millis(100)),
                _ => return,
            }
        }
    }

    /// Submits exactly the approved form, or refuses if the page moved on.
    pub fn submit(&mut self, approved: &Value) -> Result<Value, Refusal> {
        let before = self.snapshot()?;
        let destination = approved["destination"].as_str().unwrap_or_default();
        if before["pageFingerprint"] != approved["pageFingerprint"] {
            return Err(refuse(
                "page_changed",
                "The page changed since it was approved. Take a new snapshot and ask again.",
            ));
        }
        // The fingerprint binds every form and each button's place in the page, so
        // this ref is the same button the person approved.
        let at = self.locate(approved["ref"].as_str().unwrap_or_default())?;
        if at["submit"] != true
            || at["destination"] != destination
            || at["method"] != approved["method"]
        {
            return Err(refuse(
                "page_changed",
                "The form's destination changed since it was approved.",
            ));
        }
        if at["disabled"] == true {
            return Err(refuse(
                "not_submitted",
                "That button is disabled, so the form was not sent.",
            ));
        }
        let Some(origin) = origin_of(destination).filter(|o| self.policy.allows_origin(o)) else {
            return Err(refuse(
                "origin_blocked",
                "The form sends to a site that is not allowed.",
            ));
        };
        let method = approved["method"].as_str().unwrap_or("POST").to_owned();
        self.policy.sent.clear();
        self.policy.set_mode(Mode::Submit, Some(origin));
        let clicked = self.mouse_click(&at);
        if clicked.is_ok() {
            self.settle(Duration::from_secs(15));
            self.await_answers(destination, &method);
        }
        self.policy.set_mode(Mode::Auto, None);
        clicked.map_err(|e| Refusal { unknown: true, ..e })?;
        let observed = match judge(destination, &method, &self.policy.sent.entries()) {
            Verdict::Confirmed { method } => method,
            // The click went out but the browser saw no request: a definite "not sent"
            // (no `observed`), which the model may propose again with a fresh approval.
            Verdict::NotSent => {
                return Ok(json!({"submitted": false, "destination": destination,
                    "note": "The click did not send the form."}))
            }
            Verdict::Unknown { reason, message } => {
                return Err(Refusal {
                    reason,
                    message,
                    unknown: true,
                })
            }
        };
        let shot = self
            .cdp
            .call(
                "Page.captureScreenshot",
                json!({"format": "png"}),
                Some(&self.page),
            )
            .ok()
            .and_then(|v| {
                base64::engine::general_purpose::STANDARD
                    .decode(v["data"].as_str()?)
                    .ok()
            })
            .map(|bytes| sha256(&bytes));
        let after = self
            .landed()
            .unwrap_or_else(|e| json!({"url": "about:blank", "title": "", "note": e.message}));
        let url = clip_url(after["url"].as_str().unwrap_or("about:blank"));
        Ok(json!({"submitted": true, "destination": destination,
            "observed": {"method": observed, "destination": destination},
            "url": url, "title": after["title"],
            "pageFingerprint": after["pageFingerprint"], "screenshotSha256": shot,
            "popupsBlocked": self.shared.popups.load(Ordering::SeqCst)}))
    }
}
