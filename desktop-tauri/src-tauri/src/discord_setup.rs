use std::io::{IsTerminal, Read};

use crate::discord::validate_webhook;
use crate::model_watch_discord::{configured_webhook, send_test};
use crate::secret_store::SecretStore;

const MAX_INPUT_BYTES: u64 = 4_096;

pub fn handle_cli() -> Option<Result<&'static str, String>> {
    let mut args = std::env::args().skip(1);
    let command = args.next()?;
    let result = match command.as_str() {
        "--configure-discord-webhook" => configure(),
        "--test-discord-webhook" => test_configured(),
        "--clear-discord-webhook" => clear(),
        "--configure-report-webhook" | "--test-report-webhook" | "--clear-report-webhook" => {
            Err("Report delivery is managed by the Vibyra service; no local setup is needed".into())
        }
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
    tauri::async_runtime::block_on(send_test(webhook))
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
    SecretStore.write_discord_model_webhook(Some(&webhook))?;
    Ok("Discord model alerts are connected; a test message was sent.")
}

fn test_configured() -> Result<&'static str, String> {
    let webhook = configured_webhook()?
        .ok_or_else(|| "No Discord model-alert webhook is configured".to_string())?;
    probe(&webhook)?;
    Ok("Discord accepted the Vibyra test notification.")
}

fn clear() -> Result<&'static str, String> {
    SecretStore.write_discord_model_webhook(None)?;
    Ok("Discord model alerts were disconnected.")
}
