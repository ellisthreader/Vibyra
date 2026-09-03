use serde_json::json;

use super::classify::{classify, escalation_risk};
use super::risk::Risk;
use super::shell_risk::bash_risk;

fn risk_of(command: &str) -> Risk {
    bash_risk(command)
}

/// Looking is not a question. Every command here reads and nothing else.
#[test]
fn read_only_commands_are_reads() {
    for command in [
        "ls -la",
        "cat src/main.rs | head -40",
        "git status && git diff --stat",
        "git log --oneline -5",
        "rg -n 'fn main' src",
        "find . -name '*.rs' | wc -l",
        "FOO=1 grep -r todo src 2>/dev/null",
        "npm ls --depth=0",
        "cargo metadata --format-version 1",
        "/usr/bin/echo hello",
    ] {
        assert_eq!(risk_of(command), Risk::Read, "{command}");
    }
}

/// Anything that changes the machine without leaving it is a write: builds,
/// tests, redirects, in-place edits, and every program the table has not met.
#[test]
fn unknown_and_mutating_local_commands_are_writes() {
    for command in [
        "npm test",
        "cargo build",
        "echo hi > notes.txt",
        "sed -i 's/a/b/' file.txt",
        "git commit -am 'wip'",
        "git stash pop",
        "python3 script.py",
        "rm notes.txt",
        "",
    ] {
        assert_eq!(risk_of(command), Risk::Write, "{command:?}");
    }
}

#[test]
fn removing_things_is_destructive() {
    for command in [
        "rm -rf build",
        "rm -r ./tmp && ls",
        "git reset --hard HEAD~1",
        "git clean -fdx",
        "git push --force origin main",
        "git branch -D feature",
        "psql -c 'DROP TABLE users'",
        "dd if=/dev/zero of=/dev/sda",
    ] {
        assert_eq!(risk_of(command), Risk::Destructive, "{command}");
    }
}

#[test]
fn leaving_the_machine_is_publishing() {
    for command in [
        "git push origin main",
        "gh pr create --fill",
        "npm publish",
        "curl -X POST https://api.example.com/hooks -d '{}'",
        "curl --data @body.json https://example.com",
        "scp dist.tar.gz host:/srv",
        "ssh deploy@host 'systemctl restart app'",
    ] {
        assert_eq!(risk_of(command), Risk::Publish, "{command}");
    }
    assert_eq!(
        risk_of("curl https://example.com/health"),
        Risk::Write,
        "a plain GET is not a publish, but it is not a read either"
    );
}

/// Credentials always stop, whichever way they would be read out.
#[test]
fn reading_credentials_is_secret() {
    for command in [
        "cat .env",
        "cat .env.local | grep KEY",
        "printenv | grep TOKEN",
        "env",
        "gh auth token",
        "cat ~/.ssh/id_rsa",
        "cat ~/.aws/credentials",
    ] {
        assert_eq!(risk_of(command), Risk::Secret, "{command}");
    }
    assert_eq!(
        risk_of("env FOO=1 ls"),
        Risk::Read,
        "env as a prefix is not a dump"
    );
    assert_eq!(risk_of("cat docs/environment.md"), Risk::Read);
}

/// Tools map by name, and the detail is always the input — never a summary.
#[test]
fn tools_classify_by_name_and_carry_their_exact_input() {
    let read = classify("Read", &json!({"file_path": "/home/a/x.rs"}));
    assert_eq!(read.risk, Risk::Read);
    assert_eq!(read.target, "/home/a/x.rs");

    let edit = classify(
        "Edit",
        &json!({"file_path": "/home/a/x.rs", "old_string": "a"}),
    );
    assert_eq!(edit.risk, Risk::Write);
    assert_eq!(edit.action, "file.write");
    assert_eq!(edit.detail, "/home/a/x.rs");

    let shell = classify("Bash", &json!({"command": "git push origin main --tags"}));
    assert_eq!(shell.risk, Risk::Publish);
    assert_eq!(shell.action, "shell.run");
    assert_eq!(shell.target, "git push origin");
    assert_eq!(shell.detail, "git push origin main --tags");

    let unknown = classify("mcp__linear__create_issue", &json!({"title": "x"}));
    assert_eq!(unknown.risk, Risk::Secret);
    assert!(unknown.detail.contains("\"title\""));
}

#[test]
fn handoff_phrases_map_to_their_consequence() {
    assert_eq!(escalation_risk("publish"), Risk::Publish);
    assert_eq!(escalation_risk("send the email"), Risk::Publish);
    assert_eq!(escalation_risk("refund"), Risk::Spend);
    assert_eq!(escalation_risk("charge"), Risk::Spend);
    assert_eq!(escalation_risk("delete the"), Risk::Destructive);
    assert_eq!(escalation_risk("drop the table"), Risk::Destructive);
    assert_eq!(escalation_risk("force push"), Risk::Destructive);
    assert_eq!(escalation_risk("full access"), Risk::Secret);
    assert_eq!(escalation_risk("rotate the key"), Risk::Secret);
    assert_eq!(escalation_risk("without asking"), Risk::Secret);
}
