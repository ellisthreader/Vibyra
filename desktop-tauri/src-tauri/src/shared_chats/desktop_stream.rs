use tauri::{Emitter, Manager};
/// One application-owned subscription serves all visible structured panes.
pub fn spawn(app: tauri::AppHandle) {
    let events = app
        .state::<crate::state::AppState>()
        .shared_chats
        .subscribe();
    std::thread::spawn(move || {
        for event in events {
            if matches!(
                event["event"].as_str(),
                Some(
                    "conversation.updated" | "conversation.resync" | "conversation.controlChanged"
                )
            ) {
                let _ = app.emit("shared-chat-event", &event);
            }
        }
    });
}
