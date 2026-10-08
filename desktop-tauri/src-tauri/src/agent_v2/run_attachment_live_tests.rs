//! One real Claude Code run (Haiku) with a photo, a text file and a PDF
//! delivered inline. It uses the Mac's Claude login, so it only runs explicitly:
//! `VIBYRA_BROKER_BIN=target/debug/vibyra-desktop cargo test --lib live_claude_reads -- --ignored --nocapture`

use super::harness::{backend, claimed, selection, three};
use crate::agent_v2::attachments_support::api;
use crate::agent_v2::claude_cmd::find_program;
use crate::agent_v2::execute::Outcome;
use crate::agent_v2::run::{run, Account};

#[test]
#[ignore]
fn live_claude_reads_inline_attachments_and_nothing_else() {
    let (items, serve) = three();
    let server = backend(serve);
    let account = Account {
        program: find_program("claude").expect("claude on PATH"),
        config_dir: None,
        memory_roots: vec![dirs::home_dir().unwrap().join(".claude")],
    };
    let prompt = "Do not call any tool. Reply in one line, three items separated by semicolons: \
                  the main colour of the attached photo; the secret code in the attached text \
                  file; the codeword in the attached PDF.";
    let claim = claimed(items, prompt);
    let outcome = tauri::async_runtime::block_on(run(
        api(&server),
        claim,
        selection(),
        account,
        std::sync::Arc::new(crate::agent_v2::execute::Control::default()),
    ));
    let requests = server.requests.lock().unwrap().clone();
    for request in &requests {
        eprintln!("{} {}", request.method, request.path);
    }
    assert_eq!(outcome, Outcome::Completed);
    let complete = requests.iter().find(|r| r.path.ends_with("/complete"));
    let answer = complete.unwrap().body["answer"]
        .as_str()
        .unwrap()
        .to_owned();
    eprintln!("[live] answer: {answer}");
    assert!(answer.to_lowercase().contains("red"), "photo: {answer}");
    assert!(answer.contains("PLUM-7"), "text file: {answer}");
    assert!(answer.contains("MANGO-19"), "PDF: {answer}");
}
