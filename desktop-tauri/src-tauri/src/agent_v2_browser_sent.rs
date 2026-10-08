//! What an approved submit actually sent. While a submit is in flight every
//! request the browser makes is logged with how the site answered, so the
//! receipt says only what was observed (a disabled or swallowed click sent
//! nothing; an error answer to a real POST is an unknown outcome), never just
//! that a click was dispatched.

use super::policy::origin_of;
use std::sync::Mutex;

#[derive(Clone, Debug)]
pub struct Sent {
    pub id: String,
    pub method: String,
    pub url: String,
    pub kind: String,
    pub status: Option<u16>,
    pub failed: bool,
}

#[derive(Default)]
pub struct SentLog(Mutex<Vec<Sent>>);

impl SentLog {
    pub fn clear(&self) {
        self.0.lock().unwrap().clear();
    }

    pub fn record(&self, id: &str, method: &str, url: &str, kind: &str) {
        let mut log = self.0.lock().unwrap();
        if log.len() < 300 {
            log.push(Sent {
                id: id.into(),
                method: method.into(),
                url: url.into(),
                kind: kind.into(),
                status: None,
                failed: false,
            });
        }
    }

    pub fn status(&self, id: &str, status: u16) {
        for sent in self.0.lock().unwrap().iter_mut().filter(|s| s.id == id) {
            sent.status = Some(status);
        }
    }

    pub fn failed(&self, id: &str) {
        for sent in self.0.lock().unwrap().iter_mut().filter(|s| s.id == id) {
            sent.failed = true;
        }
    }

    pub fn entries(&self) -> Vec<Sent> {
        self.0.lock().unwrap().clone()
    }
}

#[derive(Debug, PartialEq)]
pub enum Verdict {
    /// The approved request went out (this is the method the browser was seen to
    /// use) and the site answered without an error.
    Confirmed { method: String },
    /// Nothing was sent: a disabled button, or a page that swallowed the click.
    NotSent,
    /// Data went out (or may have) but the result cannot be known. Never retried.
    Unknown {
        reason: &'static str,
        message: String,
    },
}

const SAFE: [&str; 3] = ["GET", "HEAD", "OPTIONS"];

/// `origin + path`; a `[redacted]` segment in the approved address matches any segment.
fn same_target(approved: &str, seen: &str) -> bool {
    let (Some(a), Some(b)) = (origin_of(approved), origin_of(seen)) else {
        return false;
    };
    let path = |raw: &str| {
        let url = url::Url::parse(raw).ok()?;
        Some(url.path().trim_end_matches('/').to_owned())
    };
    let (Some(a_path), Some(b_path)) = (path(approved), path(seen)) else {
        return false;
    };
    let (a_parts, b_parts): (Vec<&str>, Vec<&str>) =
        (a_path.split('/').collect(), b_path.split('/').collect());
    a == b
        && a_parts.len() == b_parts.len()
        && a_parts
            .iter()
            .zip(&b_parts)
            .all(|(x, y)| x == y || x.contains("redacted"))
}

/// Decides what the requests seen during an approved submit mean.
pub fn judge(destination: &str, method: &str, sent: &[Sent]) -> Verdict {
    let get_form = method.eq_ignore_ascii_case("GET");
    let unsafe_method = |s: &Sent| !SAFE.contains(&s.method.as_str());
    let hit = sent.iter().find(|s| {
        same_target(destination, &s.url) && (unsafe_method(s) || (get_form && s.kind == "Document"))
    });
    let Some(hit) = hit else {
        if sent.iter().any(unsafe_method) {
            return Verdict::Unknown {
                reason: "unavailable",
                message: "The page sent data somewhere other than the form's address, so the outcome is unknown.".into(),
            };
        }
        return Verdict::NotSent;
    };
    match hit.status {
        Some(200..=399) if !hit.failed => Verdict::Confirmed {
            method: hit.method.clone(),
        },
        Some(code) => Verdict::Unknown {
            reason: "unavailable",
            message: format!("The site answered with an error (HTTP {code}); the form may or may not have been processed."),
        },
        None => Verdict::Unknown {
            reason: "timeout",
            message: "The form was sent but the site never answered, so the outcome is unknown.".into(),
        },
    }
}

#[cfg(test)]
#[path = "agent_v2_browser_sent_tests.rs"]
mod tests;
