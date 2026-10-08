//! The model-facing page operations that read: snapshot and open, and the
//! check that the page is still on a granted site. Every one rechecks control
//! (not paused, browser alive) and the granted sites. Results carry a fresh
//! snapshot whose pageFingerprint covers the WHOLE page's forms (F-06): every
//! form, field, real value, hidden input, select option and button, not the
//! bounded summary an approval card shows.

use super::session::{refuse, Refusal, Session};
use super::submit::fingerprint;
use serde_json::{json, Value};
use std::time::Duration;

/// More form state than this is refused rather than truncated (a cut-off fingerprint binds less).
const MAX_FORM_STATE: usize = 8_000_000;

impl Session {
    pub fn snapshot(&mut self) -> Result<Value, Refusal> {
        self.control()?;
        let mut snap = self.eval("snapshot", json!({}))?;
        self.sigs = snap["sigs"]
            .as_array()
            .into_iter()
            .flatten()
            .map(|s| s.as_str().unwrap_or_default().to_owned())
            .collect();
        let full = snap["full"].as_str().unwrap_or_default().to_owned();
        if full.is_empty() {
            return Err(refuse("unavailable", "The page could not be read."));
        }
        if full.len() > MAX_FORM_STATE {
            return Err(refuse(
                "refused",
                "This page's forms are too large to read safely.",
            ));
        }
        if let Some(map) = snap.as_object_mut() {
            map.remove("sigs");
            map.remove("full");
        }
        let url = snap["url"].as_str().unwrap_or_default();
        if url != "about:blank" && !self.policy.allows_url(url) {
            return Err(refuse(
                "origin_blocked",
                "The browser is not on an allowed site. Open one first.",
            ));
        }
        snap["pageFingerprint"] = json!(fingerprint(&full));
        let blocked = self.policy.take_blocked();
        if !blocked.is_empty() {
            snap["blocked"] = json!(blocked);
        }
        // The receipt must fit the server bound: drop trailing elements (refs stay stable).
        while snap.to_string().len() > 26_000
            && snap["elements"].as_array().is_some_and(|e| !e.is_empty())
        {
            if let Some(elements) = snap["elements"].as_array_mut() {
                elements.truncate(elements.len() * 4 / 5);
            }
            snap["elementsTruncated"] = json!(true);
        }
        if snap["challenge"] == true {
            snap["hint"] = json!("This page shows a sign-in or human check. Use browser_takeover_request; never try to solve it.");
        }
        Ok(snap)
    }

    /// After navigation: still on a granted site, or back to a blank page with the reason.
    pub(crate) fn landed(&mut self) -> Result<Value, Refusal> {
        let state = self.eval("state", json!({}))?;
        let url = state["url"].as_str().unwrap_or_default().to_owned();
        if url != "about:blank" && !self.policy.allows_url(&url) {
            let blocked = self.policy.take_blocked().join(", ");
            let _ = self.cdp.call(
                "Page.navigate",
                json!({"url": "about:blank"}),
                Some(&self.page),
            );
            self.settle(Duration::from_secs(3));
            let what = if blocked.is_empty() {
                "a site that is not allowed".to_owned()
            } else {
                blocked
            };
            return Err(refuse(
                "origin_blocked",
                format!("The page tried to leave the allowed sites ({what}). It was stopped."),
            ));
        }
        self.snapshot()
    }

    pub fn open(&mut self, url: &str) -> Result<Value, Refusal> {
        self.control()?;
        if !self.policy.allows_url(url) {
            return Err(refuse(
                "origin_blocked",
                "That site is not in this teammate's allowed sites.",
            ));
        }
        self.policy.take_blocked();
        self.cdp.call_for(
            "Page.navigate",
            json!({"url": url}),
            Some(&self.page),
            Duration::from_secs(30),
        )?;
        self.settle(Duration::from_secs(15));
        self.landed()
    }
}
