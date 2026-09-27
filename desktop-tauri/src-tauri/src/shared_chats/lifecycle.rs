use super::{registry, SharedChats};
impl SharedChats {
    /// Removing a Desktop project also removes its phone exposure and stops its
    /// agents. Journals stay on disk as private archives, never under a new ID.
    pub fn remove_project(&self, project_id: &str) -> Result<(), String> {
        self.check()?;
        let _action = self.local_action.lock();
        let mut slots = self.slots.lock();
        let projects: Vec<_> = slots
            .iter()
            .filter(|slot| slot.project.project_id != project_id)
            .map(|slot| slot.project.clone())
            .collect();
        for slot in slots
            .iter()
            .filter(|slot| slot.project.project_id == project_id)
        {
            slot.engine.shutdown_conversations();
            for session in self.cli.sessions_for_engine(&slot.engine) {
                self.cli.stop(&session);
            }
        }
        registry::save(&self.path, &projects)?;
        slots.retain(|slot| slot.project.project_id != project_id);
        Ok(())
    }
}
