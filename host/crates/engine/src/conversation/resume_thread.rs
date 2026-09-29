use super::runtime::Runtime;
use serde_json::{json, Value};

// Only an unused terminal can start afresh after a definitive missing rollout.
// History, receipts and uncertain failures always retain exact-thread recovery.
pub(super) fn resume_thread(
    runtime: &Runtime,
    mut params: Value,
    unused: bool,
) -> Result<(Value, bool), String> {
    // Resume preserves the original dynamic tool set. Update guidance without
    // replacing the saved thread or pretending new tools can be added to it.
    params["developerInstructions"] = json!(format!("{} Older saved threads may not expose vibyra_preview_status or vibyra_run_app. Without vibyra_run_app, never start a desktop app with shell commands (the sandbox hides its window): ask the user to press Run in Live preview on their phone. Never claim a decoded frame from process liveness alone.", super::preview_tool::INSTRUCTIONS));
    let missing = format!(
        "no rollout found for thread id {}",
        params["threadId"].as_str().unwrap_or("")
    );
    for attempt in 0..6 {
        match runtime.request("thread/resume", params.clone()) {
            Ok(value) => return Ok((value, false)),
            Err(error)
                if !error.unknown
                    && unused
                    && error.message == missing
                    && params["approvalPolicy"].is_string()
                    && params["sandbox"].is_string() =>
            {
                let object = params
                    .as_object_mut()
                    .ok_or("Saved launch settings are unavailable")?;
                object.remove("threadId");
                object.remove("excludeTurns");
                configure_start(&mut params);
                return runtime
                    .request("thread/start", params)
                    .map(|value| (value, true))
                    .map_err(Into::into);
            }
            Err(error)
                if !error.unknown
                    && error.message.contains("already has an active writer")
                    && attempt < 5 =>
            {
                std::thread::sleep(std::time::Duration::from_millis(100 << attempt));
            }
            Err(error) => return Err(error.into()),
        }
    }
    unreachable!()
}

pub(super) fn configure_start(params: &mut Value) {
    params.as_object_mut().unwrap().extend(json!({
        "approvalsReviewer":"user", "ephemeral":false,
        "dynamicTools":[super::question_tool::spec(), super::preview_tool::spec(), super::run_tool::spec()],
        "developerInstructions":format!("Present concise useful updates. Use the vibyra_ask_user tool when user direction is required; it displays a native question card and waits for their answer. Do not use it for execution approval. Do not narrate routine commands. {} {}",super::run_tool::INSTRUCTIONS,super::preview_tool::INSTRUCTIONS)
    }).as_object().unwrap().clone());
}
