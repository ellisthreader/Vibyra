use super::fixtures::*;
use super::*;

fn gone(pid_file: std::path::PathBuf) -> impl FnMut() -> bool {
    move || {
        // A script stopped before it wrote its pid file never ran: also gone.
        let Ok(pid) = std::fs::read_to_string(&pid_file).map(|p| p.trim().parse::<i32>()) else {
            return true;
        };
        let pid = pid.unwrap();
        // SAFETY: signal 0 only checks that the process exists.
        unsafe { libc::kill(pid, 0) != 0 }
    }
}

fn connecting(f: &Fixture, provider: &str) -> Value {
    let first = call(
        f,
        "connect",
        json!({"provider":provider,"account":"default"}),
    )
    .unwrap();
    assert_eq!(account(&first, provider)["status"], "connecting");
    wait(|| account(&call(f, "list", json!({})).unwrap(), provider)["signInPageAvailable"] == true);
    account(&call(f, "list", json!({})).unwrap(), provider)
}

#[test]
fn codex_device_sign_in_shows_a_code_and_page_then_connects_on_submit() {
    let f = both();
    let row = connecting(&f, "codex");
    assert_eq!(row["deviceCode"], "ABCD-EFGH");
    let url = call(&f, "signInUrl", json!({"provider":"codex"})).unwrap();
    assert_eq!(url["url"], "https://auth.example.test/codex/device");
    // The CLI waits on stdin: submit answers it, and the account connects.
    assert!(call(&f, "submit", json!({"provider":"codex","value":""})).is_err());
    assert!(call(&f, "submit", json!({"provider":"codex","value":"a\nb"})).is_err());
    let after = call(&f, "submit", json!({"provider":"codex","value":"approve"})).unwrap();
    let mut replies = vec![after.to_string(), url.to_string(), row.to_string()];
    wait(|| {
        let list = call(&f, "list", json!({})).unwrap();
        replies.push(list.to_string());
        account(&list, "codex")["status"] == "connected"
    });
    let done = account(&call(&f, "list", json!({})).unwrap(), "codex");
    assert_eq!(
        (done["deviceCode"].as_str(), done["prompt"].as_str()),
        (Some(""), Some(""))
    );
    // The CLI really wrote a credential to its own folder; none of it leaks.
    assert!(
        std::fs::read_to_string(f.dir.path().join("home/.codex/auth.json"))
            .unwrap()
            .contains(SECRET)
    );
    assert!(replies.iter().all(|reply| !reply.contains(SECRET)));
}

#[test]
fn claude_sign_in_asks_for_the_pasted_code() {
    let f = both();
    let row = connecting(&f, "claude");
    assert_eq!(row["deviceCode"], "");
    wait(|| {
        account(&call(&f, "list", json!({})).unwrap(), "claude")["prompt"]
            == "Paste code here if prompted >"
    });
    let url = call(&f, "signInUrl", json!({"provider":"claude"})).unwrap();
    assert_eq!(
        url["url"],
        "https://claude.com/cai/oauth/authorize?code=true"
    );
    call(
        &f,
        "submit",
        json!({"provider":"claude","value":"good-code"}),
    )
    .unwrap();
    wait(|| account(&call(&f, "list", json!({})).unwrap(), "claude")["status"] == "connected");
    assert!(!call(&f, "list", json!({}))
        .unwrap()
        .to_string()
        .contains(SECRET));
}

#[test]
fn a_rejected_code_is_an_error_that_quotes_the_cli() {
    let f = both();
    connecting(&f, "codex");
    call(&f, "submit", json!({"provider":"codex","value":"wrong"})).unwrap();
    wait(|| account(&call(&f, "list", json!({})).unwrap(), "codex")["status"] == "error");
    let row = account(&call(&f, "list", json!({})).unwrap(), "codex");
    assert!(row["detail"]
        .as_str()
        .unwrap()
        .contains("the code was rejected"));
    assert_eq!(row["deviceCode"], "");
}

#[test]
fn cancel_stops_the_process_and_leaves_a_sign_in_row() {
    let f = both();
    connecting(&f, "codex");
    let pid_file = f.dir.path().join("home/codex.pid");
    let after = call(&f, "cancel", json!({"provider":"codex"})).unwrap();
    let row = account(&after, "codex");
    assert_eq!(row["status"], "sign-in-required");
    assert_eq!(row["detail"], "The sign-in was cancelled.");
    wait(gone(pid_file));
    // Starting again clears the note.
    assert_eq!(
        account(
            &call(&f, "connect", json!({"provider":"codex"})).unwrap(),
            "codex"
        )["status"],
        "connecting"
    );
}

#[test]
fn a_sign_in_left_open_is_stopped_at_the_limit() {
    let limits = Limits {
        login: Duration::from_millis(2000),
        tick: Duration::from_millis(40),
        settle: Duration::from_secs(3),
    };
    let f = fixture(&[("codex", CODEX)], limits);
    let first = call(&f, "connect", json!({"provider":"codex"})).unwrap();
    assert_eq!(account(&first, "codex")["status"], "connecting");
    wait(|| account(&call(&f, "list", json!({})).unwrap(), "codex")["status"] == "error");
    let row = account(&call(&f, "list", json!({})).unwrap(), "codex");
    assert!(row["detail"]
        .as_str()
        .unwrap()
        .contains("not finished within 2 seconds"));
    wait(gone(f.dir.path().join("home/codex.pid")));
}

#[test]
fn disconnect_signs_out_and_add_is_connect() {
    let f = both();
    std::fs::write(f.dir.path().join("home/.fake-claude"), "").unwrap();
    assert_eq!(
        account(&call(&f, "list", json!({})).unwrap(), "claude")["status"],
        "connected"
    );
    let out = call(
        &f,
        "disconnect",
        json!({"provider":"claude","account":"default"}),
    )
    .unwrap();
    assert_eq!(account(&out, "claude")["status"], "sign-in-required");
    let added = call(&f, "add", json!({"provider":"claude"})).unwrap();
    assert_eq!(account(&added, "claude")["status"], "connecting");
}

#[test]
fn the_login_runs_without_inherited_secrets() {
    std::env::set_var("OPENAI_API_KEY", "sk-must-not-leak");
    std::env::set_var("VIBYRA_RUNTIME_TOKEN", "runtime-must-not-leak");
    let f = both();
    connecting(&f, "codex");
    let seen = std::fs::read_to_string(f.dir.path().join("home/codex.env")).unwrap();
    assert_eq!(seen.trim(), "key=unset token=unset");
}

#[test]
fn a_sign_in_over_a_connected_login_still_shows_its_code_then_connects() {
    let f = both();
    connecting(&f, "codex");
    call(&f, "submit", json!({"provider":"codex","value":"approve"})).unwrap();
    wait(|| account(&call(&f, "list", json!({})).unwrap(), "codex")["status"] == "connected");
    // Cloud replacing a copy of the Mac's login: the running attempt wins over the old connected login.
    let row = connecting(&f, "codex");
    assert_eq!(row["deviceCode"], "ABCD-EFGH");
    call(&f, "submit", json!({"provider":"codex","value":"approve"})).unwrap();
    wait(|| account(&call(&f, "list", json!({})).unwrap(), "codex")["status"] == "connected");
}
