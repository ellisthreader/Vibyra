use std::io::{IsTerminal, Read};

use crate::discord::validate_webhook;
use crate::model_watch_discord::{configured_webhook, send_test};
use crate::report::{deliver, sample_report};
use crate::secret_store::SecretStore;

const MAX_INPUT_BYTES: u64 = 4_096;

/// Which webhook a command is about. The two channels are configured, tested
/// and cleared independently — one is release noise the maintainer may want
/// public, the other carries users' screenshots.
enum Channel {
    ModelAlerts,
    Reports,
}

pub fn handle_cli() -> Option<Result<&'static str, String>> {
    let mut args = std::env::args().skip(1);
    let command = args.next()?;
    let result = match command.as_str() {
        "--configure-discord-webhook" => configure(Channel::ModelAlerts),
        "--test-discord-webhook" => test_configured(Channel::ModelAlerts),
        "--clear-discord-webhook" => clear(Channel::ModelAlerts),
        "--configure-report-webhook" => configure(Channel::Reports),
        "--test-report-webhook" => test_configured(Channel::Reports),
        "--clear-report-webhook" => clear(Channel::Reports),
        _ => return None,
    };
    if args.next().is_some() {
        return Some(Err(
            "Discord setup commands do not accept extra arguments".into()
        ));
    }
    Some(result)
}

fn stored(channel: &Channel) -> Result<Option<String>, String> {
    match channel {
        Channel::ModelAlerts => configured_webhook(),
        Channel::Reports => crate::report::configured_webhook(),
    }
}

fn store(channel: &Channel, webhook: Option<&str>) -> Result<(), String> {
    match channel {
        Channel::ModelAlerts => SecretStore.write_discord_model_webhook(webhook),
        Channel::Reports => SecretStore.write_report_webhook(webhook),
    }
}

/// Sends the message that proves the channel works. For reports that is a
/// complete sample report rather than a one-line ping: the point of the test
/// is to show the maintainer the format they are about to start receiving.
fn probe(channel: &Channel, webhook: &str) -> Result<(), String> {
    match channel {
        Channel::ModelAlerts => tauri::async_runtime::block_on(send_test(webhook)),
        Channel::Reports => {
            let sample = sample_report();
            tauri::async_runtime::block_on(deliver(webhook, &sample, None, Vec::new(), None))
                .map(|_| ())
        }
    }
}

fn configure(channel: Channel) -> Result<&'static str, String> {
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
    probe(&channel, &webhook)?;
    store(&channel, Some(&webhook))?;
    Ok(match channel {
        Channel::ModelAlerts => "Discord model alerts are connected; a test message was sent.",
        Channel::Reports => "Discord reporting is connected; a sample report was sent.",
    })
}

fn test_configured(channel: Channel) -> Result<&'static str, String> {
    let webhook = stored(&channel)?.ok_or_else(|| match channel {
        Channel::ModelAlerts => "No Discord model-alert webhook is configured".to_string(),
        Channel::Reports => "No Discord report webhook is configured".to_string(),
    })?;
    probe(&channel, &webhook)?;
    Ok("Discord accepted the Vibyra test notification.")
}

fn clear(channel: Channel) -> Result<&'static str, String> {
    store(&channel, None)?;
    Ok(match channel {
        Channel::ModelAlerts => "Discord model alerts were disconnected.",
        Channel::Reports => "Discord reporting was disconnected.",
    })
}
