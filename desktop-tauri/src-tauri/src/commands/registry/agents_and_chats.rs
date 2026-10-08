//! The Agent computer, Agent v2, teammates, code, and the shared CLI and chats.
macro_rules! agents_and_chats {
    ([$($all:tt)*] $($rest:ident)*) => {
        registry_chain!(@join
            [$($all)*
            crate::agent_computer::agent_computer_choose,
            crate::agent_computer_grants::agent_computer_grants,
            crate::agent_computer_reveal::agent_computer_reveal_worktree,
            crate::agent_computer_review::agent_computer_worktree_status,
            crate::agent_computer_review::agent_computer_worktree_diff,
            crate::agent_computer_apply::agent_computer_worktree_apply,
            crate::agent_computer_access::agent_computer_revoke,
            crate::agent_v2::commands::agent_v2_runner_status,
            crate::agent_v2::commands::agent_v2_select_account,
            local_mcp::local_mcp_check,
            local_mcp::local_mcp_list,
            local_mcp::local_mcp_pick,
            local_mcp::local_mcp_save,
            local_mcp::local_mcp_set_enabled,
            local_mcp::local_mcp_retry,
            local_mcp::local_mcp_remove,
            local_mcp::local_mcp_connect,
            crate::agent_v2_browser::takeover::agent_browser_takeovers,
            crate::agent_v2_browser::takeover::agent_browser_show,
            crate::agent_v2_browser::takeover::agent_browser_resume,
            teammates::teammate_request,
            teammates::teammate_request_device,
            teammate_upload::teammate_upload,
            shared_cli::shared_cli_attach,
            shared_cli::shared_cli_write,
            shared_cli::shared_cli_resize,
            shared_cli::shared_cli_visibility,
            shared_chats::shared_chat_list,
            shared_chats::shared_chat_lookup_create,
            shared_chats::shared_chat_open_link,
            shared_chats::shared_chat_remove_project,
            shared_chats::shared_chat_create,
            shared_chats::shared_chat_request,
            ] $($rest)*
        )
    };
}
