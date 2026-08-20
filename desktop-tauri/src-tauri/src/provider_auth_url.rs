use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;

use parking_lot::Mutex;

pub fn capture<R: Read + Send + 'static>(mut reader: R, destination: Arc<Mutex<String>>) {
    thread::spawn(move || {
        let mut chunk = [0_u8; 1024];
        let mut output = String::new();
        while let Ok(read) = reader.read(&mut chunk) {
            if read == 0 {
                break;
            }
            output.push_str(&String::from_utf8_lossy(&chunk[..read]));
            if let Some(url) = find_https_url(&output) {
                let mut destination = destination.lock();
                if destination.is_empty() {
                    *destination = url;
                }
                return;
            }
            if output.len() > 16_384 {
                output.drain(..8_192);
            }
        }
    });
}

pub fn open(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") || url.len() > 4_096 || url.chars().any(char::is_control) {
        return Err("The provider sign-in link is unavailable.".into());
    }
    let mut command = browser_command(url);
    command.stdout(Stdio::null()).stderr(Stdio::null());
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open the provider sign-in page: {error}"))
}

fn find_https_url(text: &str) -> Option<String> {
    let start = text.find("https://")?;
    let candidate: String = text[start..]
        .chars()
        .take_while(|character| {
            !character.is_whitespace()
                && !character.is_control()
                && !matches!(character, '"' | '\'' | '<' | '>' | '(' | ')')
        })
        .collect();
    let candidate = candidate.trim_end_matches([',', '.', ';', ':', ']', '}']);
    (candidate.len() > "https://".len()).then(|| candidate.to_string())
}

#[cfg(target_os = "linux")]
fn browser_command(url: &str) -> Command {
    let mut command = Command::new("xdg-open");
    command.arg(url);
    command
}

#[cfg(target_os = "macos")]
fn browser_command(url: &str) -> Command {
    let mut command = Command::new("open");
    command.arg(url);
    command
}

#[cfg(target_os = "windows")]
fn browser_command(url: &str) -> Command {
    let mut command = Command::new("rundll32");
    command.args(["url.dll,FileProtocolHandler", url]);
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_provider_url_without_terminal_punctuation() {
        assert_eq!(
            find_https_url("Open https://auth.example.test/login?code=abc).\n"),
            Some("https://auth.example.test/login?code=abc".into())
        );
    }
}
