use super::hub::AgentWorld;
use vibyra_core::agent_runtime::TurnHandle;

pub struct TurnClaim<'a> {
    world: &'a AgentWorld,
    chat: String,
    pub handle: TurnHandle,
}

impl<'a> TurnClaim<'a> {
    pub fn new(world: &'a AgentWorld, chat: &str) -> Result<Self, String> {
        Ok(Self {
            world,
            chat: chat.into(),
            handle: world.begin(chat)?,
        })
    }
}

impl Drop for TurnClaim<'_> {
    fn drop(&mut self) {
        self.world.finish(&self.chat);
    }
}
