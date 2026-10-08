//! One Agent browser session: a private-profile Chrome behind the filtering
//! proxy, driven over CDP (a pipe, no port), with the controller lease held
//! for its lifetime. Popups opened by automation are closed, JavaScript
//! dialogs dismissed, file choosers intercepted (never answered) and
//! downloads denied. During takeover the person drives the visible window and
//! automation is paused.

use super::cdp::Cdp;
use super::chrome::{Chrome, Lease};
use super::events::handler;
use super::policy::{Mode, Policy};
use super::proxy::Proxy;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::AtomicUsize;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub(crate) const SCRIPT: &str = include_str!("agent_v2_browser_page.js");
pub(crate) const FORMS: &str = include_str!("agent_v2_browser_forms.js");

pub use super::policy::{refuse, Refusal};

#[derive(Default)]
pub(crate) struct Shared {
    pub(crate) main: Mutex<Option<(String, String)>>,
    pub popups: AtomicUsize,
    pub dialogs: AtomicUsize,
    pub choosers: AtomicUsize,
    /// Popup sessions being closed: every request they make is failed.
    pub(crate) closing: Mutex<HashSet<String>>,
    /// Sockets `Network.webSocketCreated` reported and nothing closed yet, as
    /// `(session, request id)`. The guard makes this empty; it is the backstop.
    pub(crate) sockets: Mutex<HashSet<(String, String)>>,
}

impl Shared {
    pub(crate) fn live_socket(&self) -> bool {
        !self.sockets.lock().unwrap().is_empty()
    }

    /// A frame the guard could not reach before its first line: treated as holding a socket.
    pub(crate) fn unverified(&self, session: &str) {
        let key = (session.to_owned(), "unverified-frame".to_owned());
        self.sockets.lock().unwrap().insert(key);
    }
}

pub struct Options {
    pub binary: PathBuf,
    pub profile: PathBuf,
    pub owner: String,
    pub headless: bool,
}

pub struct Session {
    pub(crate) cdp: Cdp,
    pub policy: Arc<Policy>,
    pub(crate) shared: Arc<Shared>,
    pub(crate) page: String,
    pub(crate) sigs: Vec<String>,
    chrome: Chrome,
    _proxy: Proxy,
    _lease: Lease,
}

impl Session {
    pub fn launch(options: &Options, policy: Policy) -> Result<Session, Refusal> {
        let lease =
            Lease::acquire(&options.profile, &options.owner).map_err(|m| refuse("busy", m))?;
        let policy = Arc::new(policy);
        let proxy = Proxy::start(policy.clone())
            .map_err(|_| refuse("unavailable", "Could not start the browser guard."))?;
        let (chrome, from_chrome, to_chrome) = Chrome::launch(
            &options.binary,
            &options.profile,
            proxy.port,
            options.headless,
        )?;
        let shared = Arc::new(Shared::default());
        let handle = handler(policy.clone(), shared.clone());
        let cdp = Cdp::connect(from_chrome, to_chrome, handle);
        let page = super::setup::start(&cdp, &shared)?;
        Ok(Session {
            cdp,
            policy,
            shared,
            page,
            sigs: Vec::new(),
            chrome,
            _proxy: proxy,
            _lease: lease,
        })
    }

    #[cfg(test)]
    pub(crate) fn chrome_pid(&self) -> u32 {
        self.chrome.pid()
    }

    /// Automation may act: the browser is alive and nobody has taken over.
    pub fn control(&mut self) -> Result<(), Refusal> {
        if !self.cdp.alive() || !self.chrome.running() {
            return Err(refuse(
                "unavailable",
                "The Agent browser closed. Try again to reopen it.",
            ));
        }
        if self.policy.mode() == Mode::Takeover {
            return Err(refuse(
                "paused",
                "The person is using the browser. Wait until they press Resume.",
            ));
        }
        Ok(())
    }

    /// Runs one page-script operation in a fresh Vibyra-only isolated world.
    pub(crate) fn eval(&self, op: &str, arg: Value) -> Result<Value, Refusal> {
        let tree = self
            .cdp
            .call("Page.getFrameTree", json!({}), Some(&self.page))?;
        let frame = tree["frameTree"]["frame"]["id"].clone();
        let world = self.cdp.call(
            "Page.createIsolatedWorld",
            json!({"frameId": frame, "worldName": "vibyra-agent", "grantUniveralAccess": false}),
            Some(&self.page),
        )?;
        let expression = format!("({SCRIPT})({}, {arg}, ({FORMS}))", json!(op));
        let out = self.cdp.call(
            "Runtime.evaluate",
            json!({"expression": expression,
            "contextId": world["executionContextId"], "returnByValue": true}),
            Some(&self.page),
        )?;
        if out.get("exceptionDetails").is_some() {
            return Err(refuse("unavailable", "The page could not be read."));
        }
        Ok(out["result"]["value"].clone())
    }

    /// Waits for the page to finish loading (bounded); navigation is expected.
    pub(crate) fn settle(&self, limit: Duration) {
        std::thread::sleep(Duration::from_millis(250));
        let started = Instant::now();
        while started.elapsed() < limit {
            if let Ok(state) = self.eval("state", json!({})) {
                if state["ready"] == "complete" {
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    /// Pauses automation and shows the window for the person (sign-in, checks).
    pub fn takeover(&mut self) -> Result<(), Refusal> {
        self.control()?;
        self.policy.set_mode(Mode::Takeover, None);
        self.show();
        Ok(())
    }

    pub fn show(&self) {
        let _ = self
            .cdp
            .call("Page.bringToFront", json!({}), Some(&self.page));
    }

    /// Only the person's explicit Resume on the Mac calls this.
    pub fn resume(&mut self) {
        self.policy.set_mode(Mode::Auto, None);
        self.sigs.clear();
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        let _ = self
            .cdp
            .call_for("Browser.close", json!({}), None, Duration::from_secs(2));
    }
}
