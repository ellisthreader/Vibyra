//! Desktop shell preferences (Part 18), persisted as one nested object inside
//! [`Settings`](crate::settings::Settings): the update channel, the tray
//! switch, pinned projects and groups, and shortcut overrides.
//!
//! Like `notifications.rs` this stores and repairs; the renderer decides. The
//! login item is deliberately NOT here: the operating system's own entry is the
//! truth, and a copy in settings.json could only ever disagree with it.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

pub const CHANNELS: [&str; 2] = ["stable", "beta"];
const MAX_GROUPS: usize = 24;
const MAX_NAME: usize = 40;
const MAX_ID: usize = 80;
const MAX_SHORTCUTS: usize = 64;

/// A named, collapsible run of projects in the rail.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectGroup {
    pub id: String,
    pub name: String,
    pub project_ids: Vec<String>,
    pub collapsed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ShellSettings {
    /// "stable" | "beta". Plumbing only: the updater is still inert, so this is
    /// stored and handed to the update check, nothing more.
    pub update_channel: String,
    /// The menu-bar / tray quick actions. On by default; the security
    /// indicator is a separate icon and never depends on this.
    pub tray_enabled: bool,
    pub pinned_project_ids: Vec<String>,
    pub project_groups: Vec<ProjectGroup>,
    /// Action id -> `CommandOrControl+Shift+K` style combination, only for the
    /// actions the person changed. Absent means the platform default.
    pub shortcuts: BTreeMap<String, String>,
}

impl Default for ShellSettings {
    fn default() -> Self {
        Self {
            update_channel: "stable".to_string(),
            tray_enabled: true,
            pinned_project_ids: Vec::new(),
            project_groups: Vec::new(),
            shortcuts: BTreeMap::new(),
        }
    }
}

fn id_ok(id: &str) -> bool {
    !id.is_empty() && id.len() <= MAX_ID && !id.chars().any(char::is_control)
}

impl ShellSettings {
    /// Repairs a hand-edited or downgraded file: bounded, de-duplicated, and a
    /// project in at most one group. Unknown projects are kept (a project that
    /// is away stays pinned), the renderer simply never draws them.
    pub fn sanitize(&mut self) {
        if !CHANNELS.contains(&self.update_channel.as_str()) {
            self.update_channel = "stable".to_string();
        }
        let mut seen = BTreeSet::new();
        self.pinned_project_ids
            .retain(|id| id_ok(id) && seen.insert(id.clone()));
        self.pinned_project_ids.truncate(MAX_GROUPS * 4);
        let mut grouped = BTreeSet::new();
        let mut group_ids = BTreeSet::new();
        self.project_groups.retain_mut(|group| {
            group.name = group
                .name
                .chars()
                .filter(|c| !c.is_control())
                .take(MAX_NAME)
                .collect::<String>()
                .trim()
                .to_string();
            group
                .project_ids
                .retain(|id| id_ok(id) && grouped.insert(id.clone()));
            id_ok(&group.id) && !group.name.is_empty() && group_ids.insert(group.id.clone())
        });
        self.project_groups.truncate(MAX_GROUPS);
        self.shortcuts.retain(|action, combo| {
            id_ok(action) && combo.len() <= 48 && !combo.chars().any(char::is_control)
        });
        while self.shortcuts.len() > MAX_SHORTCUTS {
            self.shortcuts.pop_last();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_stable_with_the_tray_on() {
        let shell = ShellSettings::default();
        assert_eq!(shell.update_channel, "stable");
        assert!(shell.tray_enabled && shell.project_groups.is_empty());
    }

    #[test]
    fn an_older_settings_file_without_the_object_still_loads() {
        let shell: ShellSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(shell, ShellSettings::default());
        let shell: ShellSettings = serde_json::from_str(r#"{"updateChannel":"beta"}"#).unwrap();
        assert_eq!(shell.update_channel, "beta");
    }

    #[test]
    fn sanitize_repairs_channel_names_duplicates_and_shared_projects() {
        let mut shell = ShellSettings {
            update_channel: "nightly".into(),
            pinned_project_ids: vec!["a".into(), "a".into(), "".into(), "b\n".into()],
            project_groups: vec![
                ProjectGroup {
                    id: "g1".into(),
                    name: "  Work\u{7} ".into(),
                    project_ids: vec!["a".into(), "b".into()],
                    collapsed: true,
                },
                ProjectGroup {
                    id: "g2".into(),
                    name: "Play".into(),
                    project_ids: vec!["a".into(), "c".into()],
                    collapsed: false,
                },
                ProjectGroup {
                    id: "g3".into(),
                    name: "  ".into(),
                    ..Default::default()
                },
                ProjectGroup {
                    id: "g1".into(),
                    name: "Dup".into(),
                    ..Default::default()
                },
            ],
            shortcuts: BTreeMap::from([
                ("palette".into(), "CommandOrControl+K".into()),
                ("".into(), "x".into()),
            ]),
            ..Default::default()
        };
        shell.sanitize();
        assert_eq!(shell.update_channel, "stable");
        assert_eq!(shell.pinned_project_ids, vec!["a".to_string()]);
        let names: Vec<_> = shell
            .project_groups
            .iter()
            .map(|g| g.name.as_str())
            .collect();
        assert_eq!(names, ["Work", "Play"]);
        assert_eq!(shell.project_groups[0].project_ids, ["a", "b"]);
        assert_eq!(
            shell.project_groups[1].project_ids,
            ["c"],
            "a project lives in one group"
        );
        assert_eq!(shell.shortcuts.len(), 1);
    }
}
