use super::{attachments::Inputs, prepare::Prepared, turn_execute::Execution};
use vibyra_core::agent_runtime::{PermissionBridge, PlannedTurn, TurnPlan};
pub fn build(
    execution: &Execution<'_>,
    prepared: Prepared,
    inputs: Inputs,
    bridge: &PermissionBridge,
) -> Result<(PlannedTurn, Vec<String>), String> {
    let Execution {
        world,
        chat,
        task,
        request,
        ..
    } = execution;
    let (env, env_remove) =
        super::env::for_turn(chat.engine.as_str(), request.account_id.as_deref())?;
    let images = inputs.images;
    let mut planned = TurnPlan {
        engine: chat.engine,
        session: chat.session_id.clone(),
        permission: task.spec.permission,
        cwd: prepared.cwd,
        places: vibyra_core::agent_profiles::directory_arguments(
            &prepared.places,
            task.spec.permission.writes(),
        ),
        model: task.spec.model.clone(),
        effort: task.spec.effort.clone(),
        images: images.clone(),
        prompt: request.prompt.clone(),
        system_prompt: Some(prepared.context),
        env,
        env_remove,
        bridge: Some(bridge.clone()),
    }
    .build();
    if chat.engine == vibyra_core::agent_model::Engine::Claude {
        planned
            .command
            .args
            .extend(super::claude_policy::args(&task.spec)?);
        let mut content = vec![serde_json::json!({"type":"text","text":request.prompt})];
        content.extend(inputs.claude);
        planned
            .command
            .args
            .extend(["--input-format".into(), "stream-json".into()]);
        planned.command.prompt = format!(
            "{}\n",
            serde_json::json!({"type":"user","message":{"role":"user","content":content}})
        );
    }
    if let Some(session) = &planned.session {
        vibyra_core::agent_chats::bind_session(&world.db, &chat.id, session)
            .map_err(|e| e.to_string())?;
    }
    Ok((planned, images))
}
