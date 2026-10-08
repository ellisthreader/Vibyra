//! The model-facing operations that act on an element: click and type. Each
//! rechecks control, the element's snapshot signature and the granted sites;
//! a click never submits a form, typing never enters a secret and never
//! follows a focus handler somewhere else, and neither acts on a page that
//! holds a live socket (a site's own "Send" button could message with no
//! approval, F-02).

use super::policy::origin_of;
use super::session::{refuse, Refusal, Session};
use serde_json::{json, Value};
use std::time::Duration;

impl Session {
    /// The page guard leaves no sockets; one that exists anyway (a missed
    /// frame or worker) makes input need the person: the page is refused until
    /// it is opened again.
    fn no_live_socket(&self) -> Result<(), Refusal> {
        if !self.shared.live_socket() {
            return Ok(());
        }
        Err(refuse(
            "refused",
            "This page has a live connection (a WebSocket), so a click or typing could send a message nobody approved. Open the page again with browser_open.",
        ))
    }

    pub(crate) fn locate(&mut self, r: &str) -> Result<Value, Refusal> {
        let index = r
            .strip_prefix('e')
            .and_then(|n| n.parse::<usize>().ok())
            .filter(|n| *n >= 1);
        let sig = index
            .and_then(|i| self.sigs.get(i - 1))
            .cloned()
            .ok_or_else(|| {
                refuse(
                    "page_changed",
                    "Take a snapshot first and use one of its refs.",
                )
            })?;
        let found = self.eval("locate", json!({"ref": r, "sig": sig}))?;
        if found.get("error").is_some() {
            return Err(refuse(
                "page_changed",
                "The page changed since the last snapshot. Take a new snapshot.",
            ));
        }
        if found["covered"] == true {
            return Err(refuse(
                "refused",
                "Something on the page covers that element. Take a new snapshot.",
            ));
        }
        Ok(found)
    }

    pub(crate) fn mouse_click(&self, at: &Value) -> Result<(), Refusal> {
        for kind in ["mouseMoved", "mousePressed", "mouseReleased"] {
            self.cdp.call(
                "Input.dispatchMouseEvent",
                json!({"type": kind, "x": at["x"], "y": at["y"],
                "button": "left", "clickCount": 1}),
                Some(&self.page),
            )?;
        }
        Ok(())
    }

    pub fn click(&mut self, r: &str) -> Result<Value, Refusal> {
        self.control()?;
        self.no_live_socket()?;
        let at = self.locate(r)?;
        if at["submit"] == true {
            return Err(refuse(
                "refused",
                "That button submits a form. Use browser_submit so the person can review it.",
            ));
        }
        if at["type"] == "file" {
            return Err(refuse("refused", "Uploading files is not allowed."));
        }
        let href = at["href"].as_str().unwrap_or_default();
        if origin_of(href).is_some() && !self.policy.allows_url(href) {
            return Err(refuse(
                "origin_blocked",
                "That link leads outside the allowed sites.",
            ));
        }
        self.policy.take_blocked();
        self.mouse_click(&at)?;
        self.settle(Duration::from_secs(10));
        self.landed()
    }

    pub fn type_text(&mut self, r: &str, text: &str) -> Result<Value, Refusal> {
        self.control()?;
        self.no_live_socket()?;
        let at = self.locate(r)?;
        if at["secret"] == true {
            return Err(refuse("refused", "Passwords, codes and card numbers are entered by the person. Use browser_takeover_request."));
        }
        if at["editable"] != true {
            return Err(refuse("refused", "Choose a text field."));
        }
        let sig = self.sigs[r[1..].parse::<usize>().unwrap_or(1) - 1].clone();
        let target = json!({"ref": r, "sig": sig});
        let cleared = self.eval("clear", target.clone())?;
        match cleared["error"].as_str() {
            Some("focus") => return Err(moved_focus()),
            Some(_) => {
                return Err(refuse(
                    "page_changed",
                    "The page changed since the last snapshot. Take a new snapshot.",
                ))
            }
            None => {}
        }
        // Right before the text goes in: focus is still on the field the model chose.
        if self.eval("focused", target)?["ok"] != true {
            return Err(moved_focus());
        }
        self.cdp
            .call("Input.insertText", json!({"text": text}), Some(&self.page))?;
        self.snapshot()
    }
}

fn moved_focus() -> Refusal {
    refuse(
        "refused",
        "The page moved the cursor to a different field, so nothing was typed.",
    )
}
