use super::workspace::{DesktopPane, DesktopProject, SharedWorkspace};

#[test]
fn a_terminal_the_desktop_has_not_filed_still_has_somewhere_to_live() {
    let workspace = SharedWorkspace::default();
    workspace.write().publish(
        vec![DesktopProject {
            id: "p-1".into(),
            name: "Vibyra".into(),
            path: "~/Desktop/Vibyra".into(),
        }],
        vec![DesktopPane {
            id: 7,
            project_id: "p-gone".into(),
            title: "Orphan".into(),
        }],
        None,
    );
    let workspace = workspace.read();
    // A pane filed under a project the window no longer lists, and one it has
    // not published at all, both keep their launch name and a reachable folder.
    for id in [7, 9] {
        assert_eq!(workspace.place(id, "zsh"), ("desktop".into(), "zsh".into()));
    }
    let folders = workspace.folders(true);
    assert_eq!(folders.len(), 2);
    assert_eq!(folders[1]["id"], "desktop");
    // A rename is a change of its own: nothing about the terminals moved, but
    // the phone's page did, so the live stream has to say so.
    assert_eq!(workspace.revision(), 1);
}

#[test]
fn only_the_chats_the_window_shows_are_terminals_once_it_has_said_which() {
    let workspace = SharedWorkspace::default();
    // A window that has not published yet, or an older one that never says,
    // leaves every chat listed — nothing is hidden on a guess.
    assert!(workspace.read().shows_chat("c-1"));
    workspace.write().publish(vec![], vec![], None);
    assert!(workspace.read().shows_chat("c-1"));
    workspace
        .write()
        .publish(vec![], vec![], Some(vec!["c-1".into()]));
    let workspace = workspace.read();
    assert!(workspace.shows_chat("c-1"));
    assert!(
        !workspace.shows_chat("c-closed"),
        "a chat closed on the Mac is not open anywhere"
    );
    assert!(!workspace.has_project("p-1"));
}
