//! Native terminal launch service retains its captured phone grant.
use super::{
    terminal_launch::CreateTerminalRequest,
    terminal_prepare::{prepare, LaunchContext},
};
use vibyra_core::{
    pty::{PtyManager, SessionInfo},
    CoreError,
};

/// Rechecks the captured request before preparation and immediately before spawning.
pub(super) fn create_checked(
    manager: &PtyManager,
    request: CreateTerminalRequest,
    context: LaunchContext,
    effect: Option<super::phone_effects::PhoneEffect>,
) -> Result<SessionInfo, CoreError> {
    super::phone_effects::scoped(effect, |effect| {
        if let Some(effect) = effect {
            effect
                .terminal(
                    &request.agent_id,
                    request.cwd.as_deref(),
                    request.saved_pane_id,
                )
                .map_err(CoreError::Settings)?;
        }
        super::phone_effects::check(effect).map_err(CoreError::Settings)?;
        let prepared = prepare(request, context)?;
        super::phone_effects::check(effect).map_err(CoreError::Settings)?;
        manager.create_session(&prepared.agent_id, &prepared.title, &prepared.spec)
    })
}
