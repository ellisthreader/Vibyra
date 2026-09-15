use parking_lot::RwLock;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

/// Where a terminal the desktop has not filed is listed. The phone's Projects
/// page only ever draws terminals inside a folder, so a session with no home
/// would not be reachable at all.
pub const UNFILED: &str = "desktop";

/// One of the desktop's own projects, exactly as the window lists it.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopProject {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// A pane on the desktop and the project it is being shown in.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPane {
    pub id: u64,
    pub project_id: String,
    pub title: String,
}

/// The workspace the desktop window is showing, republished by it whenever the
/// projects or the panes change.
///
/// Rust owns the PTYs but not the workspace. A project's name is something the
/// person typed, and which project a pane belongs to is a choice the window
/// made — a launch folder recovers neither, because an SSH pane has none and
/// two projects can share a root. So the window says, and the phone is served
/// the same folders under the same names rather than one invented list.
#[derive(Default)]
pub struct DesktopWorkspace {
    projects: Vec<DesktopProject>,
    panes: HashMap<u64, DesktopPane>,
    /// The shared chats the window's grid is drawing. `None` until a window
    /// that knows to say so has published: every chat is served then, the way
    /// it always was. Once published, a chat the person closed on the Mac is
    /// not a terminal the phone should list — the engine keeps every past
    /// conversation, and serving all of them put ten "terminals" on a phone
    /// beside a Mac showing two.
    chats: Option<HashSet<String>>,
    /// Bumped on every publish, so the phone's live stream can tell it to
    /// refetch after a rename — a change no terminal starting or stopping
    /// would otherwise announce.
    revision: u64,
}

pub type SharedWorkspace = Arc<RwLock<DesktopWorkspace>>;

impl DesktopWorkspace {
    pub fn publish(
        &mut self,
        projects: Vec<DesktopProject>,
        panes: Vec<DesktopPane>,
        chats: Option<Vec<String>>,
    ) {
        self.projects = projects;
        self.panes = panes.into_iter().map(|pane| (pane.id, pane)).collect();
        self.chats = chats.map(|ids| ids.into_iter().collect());
        self.revision += 1;
    }

    /// Whether the Mac's grid is showing this shared chat. Before the window
    /// has said which it shows, every chat counts as shown.
    pub fn shows_chat(&self, id: &str) -> bool {
        self.chats.as_ref().is_none_or(|shown| shown.contains(id))
    }

    /// Whether the window lists this project, so a phone can start work in it.
    pub fn has_project(&self, id: &str) -> bool {
        self.projects.iter().any(|project| project.id == id)
    }

    /// The roots the window is showing, for choosing where a new project goes.
    /// Only real paths: the unfiled grouping has none.
    pub fn roots(&self) -> Vec<std::path::PathBuf> {
        self.projects
            .iter()
            .filter(|project| !project.path.is_empty())
            .map(|project| std::path::PathBuf::from(&project.path))
            .collect()
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// The folder a live session belongs in and the name the desktop shows it
    /// by. A pane the window has not published yet — or one filed under a
    /// project it no longer lists — falls back to the unfiled folder and its
    /// launch title rather than dropping off the page.
    pub fn place(&self, id: u64, launched_as: &str) -> (String, String) {
        let pane = self.panes.get(&id).filter(|pane| {
            self.projects
                .iter()
                .any(|entry| entry.id == pane.project_id)
        });
        let title = pane
            .map(|pane| pane.title.trim())
            .filter(|title| !title.is_empty())
            .unwrap_or(launched_as);
        (
            pane.map_or_else(|| UNFILED.to_owned(), |pane| pane.project_id.clone()),
            title.to_owned(),
        )
    }

    /// The page's folder list: the desktop's own projects, and a home for
    /// terminals it has not filed — appended only when one exists, so a tidy
    /// workspace never grows an empty "Other terminals" folder.
    pub fn folders(&self, unfiled: bool) -> Vec<Value> {
        // These are terminal-grouping labels, not folders this adapter can read -
        // unlike the vault project `DesktopBackend` adds beside them, which is
        // real project.* access and says so with `filesAvailable`.
        let mut folders: Vec<Value> = self
            .projects
            .iter()
            .map(|project| json!({"id":project.id,"name":project.name,"path":project.path,"filesAvailable":false}))
            .collect();
        if unfiled {
            folders.push(
                json!({"id":UNFILED,"name":"Other terminals","path":"","filesAvailable":false}),
            );
        }
        folders
    }
}
