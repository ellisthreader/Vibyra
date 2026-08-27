use std::ffi::OsStr;
use std::io::{Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub type CodeCopier = Arc<dyn Fn(&str) -> Result<(), String> + Send + Sync>;

pub struct AuthChild {
    pub child: Child,
    copy_failed: Arc<AtomicBool>,
}

impl AuthChild {
    pub fn copy_failed(&self) -> bool {
        self.copy_failed.load(Ordering::Acquire)
    }
}

pub fn spawn(program: &OsStr, args: &[&str], copier: CodeCopier) -> Result<AuthChild, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::github_integration_probe::prepare(&mut command);
    let mut child = command
        .spawn()
        .map_err(|_| "Could not start GitHub authorization.".to_string())?;
    let stdout = child.stdout.take().ok_or_else(auth_pipe_error)?;
    let stderr = child.stderr.take().ok_or_else(auth_pipe_error)?;
    let copied = Arc::new(AtomicBool::new(false));
    let copy_failed = Arc::new(AtomicBool::new(false));
    capture(
        stdout,
        Arc::clone(&copied),
        Arc::clone(&copy_failed),
        Arc::clone(&copier),
    );
    capture(stderr, copied, Arc::clone(&copy_failed), copier);
    let mut stdin = child.stdin.take().ok_or_else(auth_pipe_error)?;
    if stdin.write_all(b"\n").and_then(|()| stdin.flush()).is_err() {
        crate::provider_auth_process::stop_child(&mut child);
        return Err("Could not continue GitHub browser authorization.".into());
    }
    drop(stdin);
    Ok(AuthChild { child, copy_failed })
}

fn auth_pipe_error() -> String {
    "Could not prepare GitHub browser authorization.".into()
}

fn capture(
    mut stream: impl Read + Send + 'static,
    copied: Arc<AtomicBool>,
    copy_failed: Arc<AtomicBool>,
    copier: CodeCopier,
) {
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 512];
        let mut tail = String::new();
        while let Ok(read) = stream.read(&mut buffer) {
            if read == 0 {
                break;
            }
            tail.push_str(&String::from_utf8_lossy(&buffer[..read]));
            if let Some(code) = device_code(&tail) {
                if !copied.swap(true, Ordering::AcqRel) && copier(&code).is_err() {
                    copy_failed.store(true, Ordering::Release);
                }
                break;
            }
            if tail.len() > 1_024 {
                let start = tail.len() - 512;
                let boundary = (start..tail.len())
                    .find(|index| tail.is_char_boundary(*index))
                    .unwrap_or(tail.len());
                tail.drain(..boundary);
            }
        }
        let _ = std::io::copy(&mut stream, &mut std::io::sink());
    });
}

fn device_code(output: &str) -> Option<String> {
    let lower = output.to_ascii_lowercase();
    let marker = lower.rfind("one-time code")?;
    output[marker..]
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '-')
        .find(|word| {
            word.len() == 9
                && word.as_bytes()[4] == b'-'
                && word.bytes().enumerate().all(|(index, byte)| {
                    index == 4 || byte.is_ascii_uppercase() || byte.is_ascii_digit()
                })
        })
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::{Duration, Instant};

    use super::{capture, device_code};

    #[test]
    fn accepts_only_a_code_after_the_official_prompt() {
        assert_eq!(
            device_code("First copy your one-time code: ABCD-1234"),
            Some("ABCD-1234".into())
        );
        assert_eq!(device_code("unrelated ABCD-1234"), None);
        assert_eq!(device_code("one-time code: token-value"), None);
    }

    #[test]
    fn records_clipboard_failure_without_returning_the_code() {
        let copied = Arc::new(AtomicBool::new(false));
        let copy_failed = Arc::new(AtomicBool::new(false));
        capture(
            Cursor::new(b"First copy your one-time code: ABCD-1234"),
            Arc::clone(&copied),
            Arc::clone(&copy_failed),
            Arc::new(|_| Err("clipboard unavailable".into())),
        );
        let deadline = Instant::now() + Duration::from_secs(1);
        while !copy_failed.load(Ordering::Acquire) && Instant::now() < deadline {
            std::thread::yield_now();
        }
        assert!(copied.load(Ordering::Acquire));
        assert!(copy_failed.load(Ordering::Acquire));
    }
}
