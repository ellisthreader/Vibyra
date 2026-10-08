//! Optional CLI changes retain the live phone request's authority and exact target.
use super::phone_effects::PhoneEffect;
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::State;
use vibyra_core::agents::{npm_package, resolve_agents};

const OPTIONAL: [&str; 7] = [
    "aider", "opencode", "qwen", "copilot", "amp", "crush", "continue",
];
#[tauri::command]
pub fn phone_optional_agents(state: State<'_, AppState>, id: String) -> Result<Value, String> {
    let effect = PhoneEffect::capture(&state, Some(&id), &["optionalAgents"], None, None)?
        .ok_or("Missing phone authorization")?;
    effect.check()?;
    let settings = state.settings.lock();
    let installs = super::agent_install::agent_installs();
    Ok(json!(resolve_agents(&[]).into_iter().filter(|agent| OPTIONAL.contains(&agent.spec.id.as_str())).map(|agent| {
        let id = &agent.spec.id;
        json!({"id":id,"name":agent.spec.name,"description":agent.spec.description,"installed":agent.installed,
            "enabled":settings.enabled_agent_ids.contains(id),"installable":npm_package(id).is_some(),
            "installHint":agent.install,"running":installs.get(id).is_some_and(|item| item.running),
            "error":installs.get(id).and_then(|item| item.error.clone())})
    }).collect::<Vec<_>>()))
}
#[tauri::command]
pub fn phone_optional_agent_change(
    state: State<'_, AppState>,
    id: String,
    agent: String,
    operation: String,
) -> Result<(), String> {
    let effect = PhoneEffect::capture(&state, Some(&id), &["optionalAgent"], None, None)?
        .ok_or("Missing phone authorization")?;
    validate_target(effect.request(), &agent, &operation)?;
    if operation == "install" {
        effect.check()?;
        return super::agent_install::start_install(agent);
    }
    let _write = state.settings_write.lock();
    let mut settings = state.settings.lock().clone();
    if operation == "enable"
        && !resolve_agents(&[])
            .iter()
            .any(|item| item.spec.id == agent && item.installed)
    {
        return Err("Install this terminal agent on your Mac first.".into());
    }
    settings.enabled_agent_ids.retain(|item| item != &agent);
    if operation == "enable" {
        settings.enabled_agent_ids.push(agent);
    }
    effect.check()?;
    settings
        .save_to(&state.settings_path)
        .map_err(|error| error.to_string())?;
    *state.settings.lock() = settings;
    Ok(())
}
fn validate_target(request: &Value, agent: &str, operation: &str) -> Result<(), String> {
    if !OPTIONAL.contains(&agent)
        || !["install", "enable", "disable"].contains(&operation)
        || request["agent"].as_str() != Some(agent)
        || request["operation"].as_str() != Some(operation)
    {
        return Err("This phone request does not authorize that agent change.".into());
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mutations_bind_an_allowlisted_agent_and_the_requested_operation() {
        let request = json!({"agent":"copilot","operation":"install"});
        assert!(validate_target(&request, "copilot", "install").is_ok());
        for (agent, operation) in [
            ("qwen", "install"),
            ("copilot", "enable"),
            ("shell", "install"),
            ("copilot;echo x", "install"),
        ] {
            assert!(validate_target(&request, agent, operation).is_err());
        }
    }
}
