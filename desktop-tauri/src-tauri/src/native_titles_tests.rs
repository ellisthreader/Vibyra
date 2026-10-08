use super::*;

const ID: &str = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";
const OTHER: &str = "9c2b7d10-4e6a-4f52-8b31-0d5e7a1c9f44";

fn claude_home(folder: &str, body: &str) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let project = dir.path().join("projects").join(folder);
    std::fs::create_dir_all(&project).unwrap();
    std::fs::write(project.join(format!("{ID}.jsonl")), body).unwrap();
    dir
}

#[test]
fn claude_reads_the_newest_title_from_any_project_folder() {
    let home = claude_home(
        "-private-tmp-a-worktree",
        concat!(
            "{\"type\":\"user\",\"message\":\"x\"}\n",
            "{\"type\":\"ai-title\",\"aiTitle\":\"Old name\",\"sessionId\":\"s\"}\n",
            "{\"type\":\"assistant\",\"text\":\"mentions \\\"ai-title\\\" in prose\"}\n",
            "{\"type\":\"ai-title\",\"aiTitle\":\"Website redesign\",\"sessionId\":\"s\"}\n",
        ),
    );
    assert_eq!(
        claude_title(home.path(), ID).as_deref(),
        Some("Website redesign")
    );
}

#[test]
fn claude_without_a_title_or_transcript_has_none() {
    let home = claude_home("-p", "{\"type\":\"user\",\"message\":\"x\"}\n");
    assert_eq!(claude_title(home.path(), ID), None);
    assert_eq!(claude_title(home.path(), OTHER), None);
    assert_eq!(claude_title(Path::new("/nonexistent/claude"), ID), None);
}

#[test]
fn a_long_transcript_is_read_from_its_end_on_a_whole_line() {
    let filler = format!(
        "{{\"type\":\"user\",\"message\":\"{}\"}}\n",
        "é".repeat(400)
    );
    let mut body = String::from("{\"type\":\"ai-title\",\"aiTitle\":\"Too early\"}\n");
    body.push_str(&filler.repeat(2_000));
    body.push_str("{\"type\":\"ai-title\",\"aiTitle\":\"  Fix   the\\nlogin bug \"}\n");
    assert!(body.len() as u64 > TAIL_BYTES);
    let home = claude_home("-p", &body);
    assert_eq!(
        claude_title(home.path(), ID).as_deref(),
        Some("Fix the login bug")
    );
}

#[test]
fn a_title_that_only_exists_before_the_tail_is_not_found() {
    let filler = format!(
        "{{\"type\":\"user\",\"message\":\"{}\"}}\n",
        "x".repeat(400)
    );
    let mut body = String::from("{\"type\":\"ai-title\",\"aiTitle\":\"Too early\"}\n");
    body.push_str(&filler.repeat(2_000));
    let home = claude_home("-p", &body);
    assert_eq!(claude_title(home.path(), ID), None);
}

#[test]
fn codex_takes_the_last_name_for_this_conversation_only() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join("session_index.jsonl"),
        format!(
            concat!(
                "{{\"id\":\"{id}\",\"thread_name\":\"review the vibyra desktop app for ma\"}}\n",
                "{{\"id\":\"{other}\",\"thread_name\":\"Someone else\"}}\n",
                "{{\"id\":\"{id}\",\"thread_name\":\"Update Vibyra Mac app\"}}\n",
                "not json at all\n",
                "{{\"id\":\"{other}\",\"thread_name\":\"Someone else, later\"}}\n",
            ),
            id = ID,
            other = OTHER
        ),
    )
    .unwrap();
    assert_eq!(
        codex_title(dir.path(), ID).as_deref(),
        Some("Update Vibyra Mac app")
    );
    assert_eq!(
        codex_title(dir.path(), "11111111-1111-4111-8111-111111111111"),
        None
    );
    assert_eq!(codex_title(Path::new("/nonexistent/codex"), ID), None);
}

#[test]
fn only_claude_and_codex_have_native_titles() {
    let home = claude_home("-p", "{\"type\":\"ai-title\",\"aiTitle\":\"Named\"}\n");
    assert_eq!(
        native_title("claude", home.path(), ID).as_deref(),
        Some("Named")
    );
    assert_eq!(native_title("gemini", home.path(), ID), None);
}

#[test]
fn conversation_requests_come_from_the_transcript_without_harness_context() {
    let home = claude_home(
        "-Users-me-app",
        concat!(
            "{\"type\":\"user\",\"isMeta\":true,\"message\":{\"content\":\"<local-command-caveat>x</local-command-caveat>\"}}\n",
            "{\"type\":\"user\",\"message\":{\"content\":\"<command-name>/model</command-name>\"}}\n",
            "{\"type\":\"user\",\"message\":{\"content\":\"hi there\"}}\n",
            "{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"content\":\"ok\"}]}}\n",
            "{\"type\":\"user\",\"isSidechain\":true,\"message\":{\"content\":\"subagent prompt\"}}\n",
            "{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"fix the login bug\"}]}}\n",
        ),
    );
    assert_eq!(
        first_requests("claude", home.path(), ID),
        ["hi there", "fix the login bug"]
    );

    let codex = tempfile::tempdir().unwrap();
    let day = codex.path().join("sessions/2026/10/01");
    std::fs::create_dir_all(&day).unwrap();
    let user = |text: &str| {
        format!(
        "{{\"type\":\"response_item\",\"payload\":{{\"type\":\"message\",\"role\":\"user\",\"content\":[{{\"type\":\"input_text\",\"text\":{}}}]}}}}\n",
        serde_json::Value::from(text)
    )
    };
    let body = [
        user("<environment_context>\n  <cwd>/x</cwd>"),
        user("hoe are u oing boss"),
        user("go through the whole code base"),
    ]
    .concat();
    std::fs::write(
        day.join(format!("rollout-2026-10-01T10-00-00-{ID}.jsonl")),
        body,
    )
    .unwrap();
    assert_eq!(
        first_requests("codex", codex.path(), ID),
        ["hoe are u oing boss", "go through the whole code base"]
    );
    assert!(first_requests("codex", codex.path(), OTHER).is_empty());
}
