//! Terminals, agent installs, usage and conversations, rendering, shortcuts, and provider accounts.
macro_rules! terminals_and_providers {
    ([$($all:tt)*] $($rest:ident)*) => {
        registry_chain!(@join
            [$($all)*
            terminal::create_terminal,
            terminal::safe_workspace_preflight,
            terminal::safe_workspace_supported,
            terminal::set_up_git_repository,
            terminal::create_ssh_terminal,
            terminal::write_terminal,
            terminal::resize_terminal,
            terminal::set_terminal_visibility,
            terminal::hold_terminal_output,
            terminal::terminal_snapshot,
            agents::list_agents,
            agent_install::install_agent_cli,
            agent_install::agent_installs,
            agent_install::clear_agent_install,
            agent_install::refresh_agents,
            agent_conversations::agent_conversation_resumable,
            render::renderer_policy,
            shortcuts::native_shortcuts_available,
            provider_accounts::provider_accounts,
            provider_accounts::connect_provider_account,
            provider_accounts::add_provider_account,
            provider_accounts::remove_provider_account,
            provider_accounts::install_provider_cli,
            provider_accounts::submit_provider_account_input,
            provider_accounts::cancel_provider_account,
            provider_accounts::open_provider_sign_in_page,
            provider_accounts::disconnect_provider_account,
            ] $($rest)*
        )
    };
}
