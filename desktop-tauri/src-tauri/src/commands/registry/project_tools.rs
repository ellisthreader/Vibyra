//! Project files, scaffolding, GitHub publishing, and Live Preview.
macro_rules! project_tools {
    ([$($all:tt)*] $($rest:ident)*) => {
        registry_chain!(@join
            [$($all)*
            fs::fs_changes,
            fs::workspace_worktrees,
            fs::fs_change_preview,
            fs::fs_list_dir,
            fs::fs_read_preview,
            fs::fs_home_dir,
            scaffold::scaffold_preflight,
            scaffold::scaffold_destination,
            scaffold::scaffold_free_name,
            scaffold::scaffold_run,
            scaffold::scaffold_cancel,
            github_publish::github_publish,
            fs::watch_workspace,
            fs::unwatch_workspace,
            preview::preview_inspect,
            preview::preview_start,
            preview::preview_status,
            preview::preview_stop,
            preview::preview_stop_project,
            preview::preview_open_url,
            preview_share::preview_share_status,
            preview_share::preview_share_available,
            preview_share::preview_share_set,
            ] $($rest)*
        )
    };
}
