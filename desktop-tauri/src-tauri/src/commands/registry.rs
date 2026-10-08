//! The one native command registry. Each part file under `registry/` lists the
//! commands the main webview may invoke, one path per line; `handler()` joins
//! the parts named below into a single `tauri::generate_handler!` call, and
//! `build_commands.rs` reads the same lines to grant each command its ACL
//! permission. Add a command to the part it belongs to, never to this file.
use super::*;

#[macro_use]
mod agents_and_chats;
#[macro_use]
mod phone_and_remote;
#[macro_use]
mod account_and_billing;
#[macro_use]
mod terminals_and_providers;
#[macro_use]
mod project_tools;
#[macro_use]
mod desktop_services;

/// Threads every part's commands into one handler list. `@join` carries the
/// list so far; each part macro appends its own and passes the rest on.
macro_rules! registry_chain {
    ($($part:ident)*) => {
        registry_chain!(@join [] $($part)*)
    };
    (@join [$($all:tt)*]) => {
        tauri::generate_handler![$($all)*]
    };
    (@join [$($all:tt)*] $part:ident $($rest:ident)*) => {
        $part!([$($all)*] $($rest)*)
    };
}

pub fn handler() -> impl Fn(tauri::ipc::Invoke<tauri::Wry>) -> bool + Send + Sync + 'static {
    registry_chain![
        agents_and_chats
        phone_and_remote
        account_and_billing
        terminals_and_providers
        project_tools
        desktop_services
    ]
}
