//! One exact request's authority, rechecked without native inventory recursion.
use super::{PreviewService, Stream};
use crate::phone::preview_grants::WindowConsent;
use crate::window_preview::Session;
use serde_json::Value;
use vibyra_host::StreamKey;
pub(super) struct WindowInput<'a> {
    pub device: &'a str,
    pub key: StreamKey,
    pub stream: &'a Stream,
    pub window: &'a Session,
    pub event: &'a Value,
    pub consent: &'a WindowConsent,
}
impl PreviewService {
    pub(super) fn require_live_window_input(&self, input: &WindowInput<'_>) -> Result<(), String> {
        let WindowInput {
            device,
            key,
            stream,
            window,
            event,
            consent,
        } = input;
        stream.require_window_input(event)?;
        let workspace = self
            .inner
            .workspace
            .try_read()
            .ok_or("Window Preview workspace is being updated")?;
        self.inner
            .grants
            .require_window_consent(consent, &workspace)?;
        drop(workspace);
        let bindings = self
            .inner
            .bindings
            .try_lock()
            .ok_or("Window Preview approval is being updated")?;
        if !bindings
            .get(&((*device).into(), key.generation()))
            .and_then(|binding| binding.window.as_ref())
            .is_some_and(|current| std::ptr::eq(current.as_ref(), *window))
        {
            return Err("Window Preview approval changed.".into());
        }
        drop(bindings);
        let typing = self
            .inner
            .typing
            .try_lock()
            .ok_or("Phone typing permission is being updated")?;
        let allowed = typing
            .as_ref()
            .is_none_or(|typing| typing.load(std::sync::atomic::Ordering::SeqCst));
        drop(typing);
        if !allowed {
            return Err("Typing from your phone is off.".into());
        }
        // Recheck the exact lease after local state snapshots. Even a nonblocking
        // check cannot lend an earlier lease check to a later OS effect.
        stream.require_window_input(event)
    }
}
