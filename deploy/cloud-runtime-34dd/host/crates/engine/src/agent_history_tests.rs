use super::*;
use crate::agent_titles::{claude_title, codex_cwd, codex_title, finish};
use serde_json::json;
use std::{fs, time::Duration};

const A: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8091";
const B: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8092";
const C: &str = "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8093";
const PROJECT: &str = "/data/projects/my app_1";

struct Fake {
    dir: tempfile::TempDir,
    homes: Homes,
}

fn fake() -> Fake {
    let dir = tempfile::tempdir().unwrap();
    let homes = Homes {
        claude: dir.path().join(".claude"),
        codex: dir.path().join(".codex"),
    };
    Fake { dir, homes }
}

fn age(path: &Path, seconds_ago: u64) {
    let when = SystemTime::now() - Duration::from_secs(seconds_ago);
    fs::OpenOptions::new().write(true).open(path).unwrap().set_modified(when).unwrap();
}

impl Fake {
    fn claude(&self, project: &str, id: &str, body: &str, ago: u64) -> PathBuf {
        let dir = self.homes.claude.join("projects").join(claude_folder(Path::new(project)));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(format!("{id}.jsonl"));
        fs::write(&file, body).unwrap();
        age(&file, ago);
        file
    }
    fn codex(&self, cwd: &str, id: &str, first_message: &str, ago: u64) -> PathBuf {
        let dir = self.homes.codex.join("sessions/2026/10/02");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join(format!("rollout-2026-10-02T09-30-00-{id}.jsonl"));
        let meta = json!({"type":"session_meta","payload":{"id":id,"cwd":cwd}});
        let said = json!({"type":"event_msg","payload":{"type":"user_message","message":first_message}});
        fs::write(&file, format!("{meta}\n{said}\n")).unwrap();
        age(&file, ago);
        file
    }
}

fn user(text: &str) -> String {
    format!("{}\n", json!({"type":"user","message":{"role":"user","content":text}}))
}

#[test]
fn claude_folder_replaces_every_non_alphanumeric() {
    assert_eq!(claude_folder(Path::new(PROJECT)), "-data-projects-my-app-1");
    assert_eq!(claude_folder(Path::new("/a/b.c/d-e")), "-a-b-c-d-e");
    assert_eq!(claude_folder(Path::new("/p/caf\u{e9}")), "-p-caf-");
    assert_eq!(claude_folder(Path::new("/p/\u{1F600}")), "-p---");
}

#[test]
fn lists_this_projects_claude_and_codex_conversations_newest_first() {
    let f = fake();
    f.claude(PROJECT, A, &user("Fix the build"), 300);
    f.claude("/data/projects/other", B, &user("Not mine"), 10);
    f.codex(PROJECT, C, "Add a login page", 100);
    f.codex("/data/projects/other", "0199f3a2-7b1c-7d4e-9a10-4c5d6e7f8099", "Not mine", 5);
    let list = list(&f.homes, Path::new(PROJECT));
    let seen: Vec<(&str, &str, &str)> = list
        .iter()
        .map(|s| {
            (s["provider"].as_str().unwrap(), s["id"].as_str().unwrap(), s["title"].as_str().unwrap())
        })
        .collect();
    assert_eq!(seen, [("codex", C, "Add a login page"), ("claude", A, "Fix the build")]);
    assert!(list[0]["updatedAt"].as_str().unwrap().ends_with('Z'));
    assert_eq!(list[1]["size"], user("Fix the build").len());
    assert!(list.iter().all(|s| s.as_object().unwrap().len() == 5));
}

#[test]
fn limit_is_thirty_and_bad_names_and_big_files_are_skipped() {
    let f = fake();
    for n in 0..40u64 {
        f.claude(PROJECT, &format!("0199f3a2-7b1c-7d4e-9a10-{n:012x}"), &user("x"), 1000 - n);
    }
    let dir = f.homes.claude.join("projects").join(claude_folder(Path::new(PROJECT)));
    for bad in ["notes.jsonl", "agent-1.jsonl", &format!("{A}.txt"), &format!("{A}.jsonl.bak")] {
        fs::write(dir.join(bad), user("bad")).unwrap();
    }
    fs::create_dir(dir.join(format!("{B}.jsonl"))).unwrap();
    let big = dir.join(format!("{C}.jsonl"));
    fs::File::create(&big).unwrap().set_len(MAX_SIZE + 1).unwrap();
    let all = list(&f.homes, Path::new(PROJECT));
    assert_eq!(all.len(), 30);
    assert_eq!(all[0]["id"], "0199f3a2-7b1c-7d4e-9a10-000000000027");
    assert!(all.iter().all(|s| s["id"] != C && s["id"] != B && s["id"] != A));
    assert!(!belongs_to("claude", &f.homes, Path::new(PROJECT), C));
}

#[test]
fn a_codex_cwd_is_matched_exactly_and_symlinks_are_not_followed() {
    let f = fake();
    f.codex("/data/projects/my app_1/sub", A, "nested", 5);
    f.codex("/data/projects/my app_1/", B, "trailing slash", 4);
    assert_eq!(list(&f.homes, Path::new(PROJECT)).len(), 1);
    let target = f.dir.path().join("elsewhere.jsonl");
    fs::write(&target, "{}").unwrap();
    let day = f.homes.codex.join("sessions/2026/10/02");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&target, day.join(format!("rollout-2026-10-02T09-00-00-{C}.jsonl"))).unwrap();
    assert!(!belongs_to("codex", &f.homes, Path::new(PROJECT), C));
    assert!(belongs_to("codex", &f.homes, Path::new(PROJECT), B));
    assert!(!belongs_to("codex", &f.homes, Path::new(PROJECT), A));
}

#[test]
fn belongs_to_refuses_other_projects_and_hostile_ids() {
    let f = fake();
    f.claude(PROJECT, A, &user("mine"), 5);
    f.claude("/data/projects/other", B, &user("theirs"), 5);
    let project = Path::new(PROJECT);
    assert!(belongs_to("claude", &f.homes, project, A));
    assert!(!belongs_to("claude", &f.homes, project, B));
    assert!(!belongs_to("codex", &f.homes, project, A));
    for id in ["../other/x", "--help", &format!("{A};ls"), ""] {
        assert!(!belongs_to("claude", &f.homes, project, id), "{id}");
    }
    assert!(!belongs_to("shell", &f.homes, project, A));
}

#[test]
fn titles_are_the_first_user_message_collapsed_and_bounded() {
    let multi = user("  Fix\n\n  the\tbuild \u{7} now\r\n");
    assert_eq!(claude_title(multi.as_bytes()), "Fix the build now");
    let long = user(&"word ".repeat(60));
    let title = claude_title(long.as_bytes());
    assert_eq!(title.chars().count(), 80);
    assert!(title.ends_with('\u{2026}'));
    assert_eq!(claude_title(user("   \n ").as_bytes()), "Conversation");
    assert_eq!(claude_title(b""), "Conversation");
    assert_eq!(finish(&"\u{e9}".repeat(200)).chars().count(), 80);
    let blocks = json!({"type":"user","message":{"role":"user","content":[
        {"type":"tool_result","content":"x"},{"type":"text","text":"From a block"}]}});
    assert_eq!(claude_title(blocks.to_string().as_bytes()), "From a block");
    let noise = format!(
        "{}\n{}\n{}",
        json!({"type":"user","isMeta":true,"message":{"role":"user","content":"meta"}}),
        json!({"type":"user","message":{"role":"user","content":"<command-name>/init</command-name>"}}),
        json!({"type":"user","message":{"role":"user","content":"Real question"}}),
    );
    assert_eq!(claude_title(noise.as_bytes()), "Real question");
}

#[test]
fn damaged_input_never_panics_or_leaks() {
    let mut bytes = user("Valid first").into_bytes();
    bytes.extend_from_slice(&[0xff, 0xfe, b'{', b'"', 0xc3]);
    assert_eq!(claude_title(&bytes), "Valid first");
    let mut only_bad = vec![0xff, 0xfe, 0xfd, b'\n', 0x80];
    only_bad.extend_from_slice(b"{\"type\":\"user\",\"message\":{\"content\":\"cut off");
    assert_eq!(claude_title(&only_bad), "Conversation");
    assert_eq!(codex_title(&only_bad), "Conversation");
    assert!(codex_cwd(&only_bad).is_none());
}

#[test]
fn codex_cwd_survives_a_session_meta_line_cut_by_the_read_limit() {
    let long = "x".repeat(70_000);
    let line = format!(
        r#"{{"timestamp":"t","type":"session_meta","payload":{{"id":"{A}","cwd":"{PROJECT}","instructions":"{long}"}}}}"#
    );
    assert!(serde_json::from_str::<serde_json::Value>(&line[..65_536]).is_err());
    assert_eq!(codex_cwd(&line.as_bytes()[..65_536]), Some(PathBuf::from(PROJECT)));
    assert_eq!(codex_cwd(b"{\"type\":\"event_msg\",\"payload\":{\"cwd\":\"/x\"}}"), None);
    let context = json!({"type":"response_item","payload":{"type":"message","role":"user",
        "content":[{"type":"input_text","text":"<environment_context>x</environment_context>"},
        {"type":"input_text","text":"The real ask"}]}});
    assert_eq!(codex_title(context.to_string().as_bytes()), "The real ask");
}
