//! Account status, from each CLI's own report. Only what the CLI says about the
//! sign-in is read; no token or credential file is ever opened here.
use super::{env::Env, Provider};
use serde_json::Value;
use std::{
    io::Read,
    path::Path,
    process::Stdio,
    thread,
    time::{Duration, Instant},
};

/// A cold first run faults a large native binary in; probes run off the
/// connection thread, so a generous budget costs a slow start, not a freeze.
const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Default)]
pub(super) struct Auth {
    pub connected: bool,
    pub probe_failed: bool,
    pub label: String,
    pub detail: String,
}

/// `(success, stdout, stderr)`, or `None` if it did not run or finish in time.
pub(super) fn run(env: &Env, program: &Path, args: &[&str]) -> Option<(bool, String, String)> {
    let mut command = env.command(program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command.spawn().ok()?;
    let stdout = drain(child.stdout.take()?);
    let stderr = drain(child.stderr.take()?);
    let started = Instant::now();
    let success = loop {
        if let Some(status) = child.try_wait().ok()? {
            break status.success();
        }
        if started.elapsed() >= TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        thread::sleep(Duration::from_millis(20));
    };
    Some((success, stdout.join().ok()?, stderr.join().ok()?))
}

fn drain<R: Read + Send + 'static>(mut reader: R) -> thread::JoinHandle<String> {
    thread::spawn(move || {
        let mut output = String::new();
        let _ = reader.by_ref().take(64 * 1024).read_to_string(&mut output);
        output
    })
}

pub(super) fn probe(env: &Env, provider: &Provider, program: &Path) -> Auth {
    let failed = Auth {
        probe_failed: true,
        ..Auth::default()
    };
    match provider.id {
        "codex" => match run(env, program, &["login", "status"]) {
            // `codex login status` reports on stderr, and says "Logged in using"
            // for API keys as well; this row is for a ChatGPT account.
            Some((true, out, err)) if chatgpt_login(&format!("{out}\n{err}")) => Auth {
                connected: true,
                label: "ChatGPT account".into(),
                detail: "ChatGPT".into(),
                ..Auth::default()
            },
            Some(_) => Auth::default(),
            None => failed,
        },
        _ => match run(env, program, &["auth", "status", "--json"]) {
            Some((success, out, _)) => claude_auth(success, &out).unwrap_or(failed),
            None => failed,
        },
    }
}

fn chatgpt_login(report: &str) -> bool {
    report.to_lowercase().contains("logged in using chatgpt")
}

/// `None` when the report is not JSON at all (the probe failed).
fn claude_auth(success: bool, output: &str) -> Option<Auth> {
    let value: Value = serde_json::from_str(output).ok()?;
    let text = |key: &str| value.get(key).and_then(Value::as_str).unwrap_or("");
    if !success
        || !matches!(text("authMethod"), "claude.ai" | "oauth_token")
        || !value
            .get("loggedIn")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return Some(Auth::default());
    }
    let plan = plan_name(text("subscriptionType"));
    Some(Auth {
        connected: true,
        label: label(text("email"), "Claude account"),
        detail: if plan.is_empty() {
            "Claude".into()
        } else {
            format!("Claude {plan}")
        },
        ..Auth::default()
    })
}

fn label(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.into()
    } else {
        value.chars().take(180).collect()
    }
}

/// `max` becomes `Max`, `edu_pro` becomes `Edu Pro`.
fn plan_name(slug: &str) -> String {
    slug.split(|c: char| c == '_' || c == '-' || c.is_whitespace())
        .filter(|word| !word.is_empty())
        .map(|word| {
            let mut chars = word.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// The first line of `--version`, bounded.
pub(super) fn version(env: &Env, program: &Path) -> String {
    run(env, program, &["--version"])
        .filter(|(success, _, _)| *success)
        .and_then(|(_, out, err)| {
            format!("{out}\n{err}")
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(|line| line.chars().filter(|c| !c.is_control()).take(80).collect())
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_chatgpt_sign_in_counts_for_codex() {
        assert!(chatgpt_login("Logged in using ChatGPT\n"));
        for report in ["Not logged in", "Logged in using an API key - sk-live", ""] {
            assert!(!chatgpt_login(report), "{report}");
        }
    }

    #[test]
    fn claude_status_names_the_account_and_plan_but_nothing_secret() {
        let ok = r#"{"loggedIn":true,"authMethod":"claude.ai","email":"a@b.c","subscriptionType":"max","token":"SECRET"}"#;
        let auth = claude_auth(true, ok).unwrap();
        assert!(auth.connected);
        assert_eq!(
            (auth.label.as_str(), auth.detail.as_str()),
            ("a@b.c", "Claude Max")
        );
        assert!(!format!("{}{}", auth.label, auth.detail).contains("SECRET"));
        assert!(
            !claude_auth(true, r#"{"loggedIn":false}"#)
                .unwrap()
                .connected
        );
        assert!(
            !claude_auth(true, r#"{"loggedIn":true,"authMethod":"api_key"}"#)
                .unwrap()
                .connected
        );
        assert!(!claude_auth(false, ok).unwrap().connected);
        assert!(claude_auth(true, "oops").is_none());
    }

    #[test]
    fn cloud_setup_token_is_an_account_login_with_no_email() {
        let auth = claude_auth(true, r#"{"loggedIn":true,"authMethod":"oauth_token","apiProvider":"firstParty"}"#).unwrap();
        assert!(auth.connected);
        assert_eq!(auth.label, "Claude account");
        assert_eq!(auth.detail, "Claude");
        assert!(!claude_auth(false, r#"{"loggedIn":true,"authMethod":"oauth_token"}"#).unwrap().connected);
        assert!(!claude_auth(true, r#"{"loggedIn":false,"authMethod":"oauth_token"}"#).unwrap().connected);
    }
}
