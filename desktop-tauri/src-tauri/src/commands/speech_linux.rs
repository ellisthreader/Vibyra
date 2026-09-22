//! Linux's local speech equivalent to `say`; text is always stdin, never flags.
use std::io::Write;
use std::process::{Child, Command, Stdio};

pub fn command(available: impl Fn(&str) -> bool) -> Result<Command, String> {
    let player = ["espeak-ng", "espeak"]
        .into_iter()
        .find(|name| available(name))
        .ok_or("Install espeak-ng to read replies aloud, then try again.")?;
    let mut command = Command::new(player);
    command.arg("--stdin");
    vibyra_core::launch_env::sanitize_command(&mut command);
    Ok(command)
}

pub fn speak(mut command: Command, text: String) -> Result<Child, String> {
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start spoken reply: {error}"))?;
    let mut input = child.stdin.take().ok_or("Speech input is unavailable")?;
    std::thread::spawn(move || {
        let _ = input.write_all(text.as_bytes());
    });
    Ok(child)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_speech_engine_returns_an_actionable_error() {
        assert!(command(|_| false).is_err());
        let primary = command(|_| true).unwrap();
        assert_eq!(primary.get_program(), "espeak-ng");
        assert_eq!(primary.get_args().collect::<Vec<_>>(), ["--stdin"]);
        assert_eq!(
            command(|name| name == "espeak").unwrap().get_program(),
            "espeak"
        );
    }

    #[cfg(unix)]
    #[test]
    fn reply_text_cannot_become_command_arguments() {
        let root = tempfile::tempdir().unwrap();
        let output = root.path().join("spoken.txt");
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "cat > \"$1\"", "fixture"]).arg(&output);
        let text = "--help\n$(never execute this)\nA reply with quotes: 'hello'.";
        let mut child = speak(command, text.into()).unwrap();
        assert!(child.wait().unwrap().success());
        assert_eq!(std::fs::read_to_string(output).unwrap(), text);
    }
}
