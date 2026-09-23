use std::io::{IsTerminal, Read};

use crate::discord::validate_webhook;
use crate::report::{deliver, sample_report};
use crate::secret_store::SecretStore;

const MAX_INPUT_BYTES: u64 = 4_096;

pub fn handle_cli() -> Option<Result<&'static str, String>> {
    let mut args = std::env::args().skip(1);
    let command = args.next()?;
    let result = match command.as_str() {
        "--configure-report-webhook" => configure(),
        "--test-report-webhook" => test_configured(),
        "--clear-report-webhook" => clear(),
        _ => return None,
    };
    if args.next().is_some() {
        return Some(Err(
            "Discord setup commands do not accept extra arguments".into()
        ));
    }
    Some(result)
}

fn probe(webhook: &str) -> Result<(), String> {
    let sample = sample_report();
    tauri::async_runtime::block_on(deliver(webhook, &sample, None, Vec::new(), None)).map(|_| ())
}

fn configure() -> Result<&'static str, String> {
    let stdin = std::io::stdin();
    if stdin.is_terminal() {
        return Err("Use the npm script so the webhook is entered invisibly".into());
    }
    let mut input = String::new();
    stdin
        .take(MAX_INPUT_BYTES)
        .read_to_string(&mut input)
        .map_err(|_| "Could not read the webhook from standard input".to_string())?;
    let webhook = validate_webhook(&input)?;
    probe(&webhook)?;
    SecretStore.write_report_webhook(Some(&webhook))?;
    Ok("Discord reporting is connected; a sample report was sent.")
}

fn test_configured() -> Result<&'static str, String> {
    let webhook = crate::report::configured_webhook()?
        .ok_or_else(|| "No Discord report webhook is configured".to_string())?;
    probe(&webhook)?;
    Ok("Discord accepted the Vibyra test notification.")
}

fn clear() -> Result<&'static str, String> {
    SecretStore.write_report_webhook(None)?;
    Ok("Discord reporting was disconnected.")
}
