use super::AgentWorld;

pub fn delete_agent(world: &AgentWorld, id: &str) -> Result<(), String> {
    world.with_agent_idle(id, || {
        let profile = vibyra_core::agent_profiles::get(&world.db, &world.account, id)
            .map_err(|e| e.to_string())?;
        let home = vibyra_core::agent_profiles::managed_home(&world.root, id)
            .map_err(|e| e.to_string())?;
        if std::path::Path::new(&profile.home_path) != home {
            return Err("This teammate's home is outside its managed storage.".into());
        }
        let chats = vibyra_core::agent_chats::ids_for_agent(&world.db, &world.account, id)
            .map_err(|e| e.to_string())?;
        for chat in &chats {
            vibyra_core::agent_chats::attachments::folder(&world.root, chat)
                .map_err(|e| e.to_string())?;
        }
        for chat in &chats {
            vibyra_core::agent_chats::attachments::discard(&world.root, chat)
                .map_err(|e| e.to_string())?;
        }
        match std::fs::remove_dir_all(&home) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        vibyra_core::agent_profiles::delete(&world.db, &world.account, id)
            .map_err(|e| e.to_string())
    })
}
