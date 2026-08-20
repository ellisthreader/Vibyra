use std::io::Read;
use std::thread;

use super::process::{push_log, LogBuffer};

const MAX_CAPTURED_LINE_BYTES: usize = 4096;

pub(crate) fn stream_output(reader: impl Read + Send + 'static, prefix: String, logs: LogBuffer) {
    thread::spawn(move || drain_output(reader, &prefix, &logs));
}

fn drain_output(mut reader: impl Read, prefix: &str, logs: &LogBuffer) {
    let mut chunk = [0_u8; 4096];
    let mut line = Vec::with_capacity(256);
    let mut truncated = false;
    loop {
        let read = match reader.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(read) => read,
        };
        for byte in &chunk[..read] {
            if *byte == b'\n' {
                emit_line(prefix, &line, truncated, logs);
                line.clear();
                truncated = false;
            } else if *byte != b'\r' {
                if line.len() < MAX_CAPTURED_LINE_BYTES {
                    line.push(*byte);
                } else {
                    truncated = true;
                }
            }
        }
    }
    if !line.is_empty() || truncated {
        emit_line(prefix, &line, truncated, logs);
    }
}

fn emit_line(prefix: &str, bytes: &[u8], truncated: bool, logs: &LogBuffer) {
    let text = String::from_utf8_lossy(bytes);
    let text = text.trim();
    if text.is_empty() && !truncated {
        return;
    }
    let suffix = if truncated { "…" } else { "" };
    push_log(logs, format!("{prefix} {text}{suffix}"));
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::{drain_output, MAX_CAPTURED_LINE_BYTES};
    use crate::preview::process::{new_logs, snapshot_logs};

    #[test]
    fn bounds_child_output_without_newlines() {
        let logs = new_logs();
        let bytes = vec![b'x'; MAX_CAPTURED_LINE_BYTES * 100];
        drain_output(Cursor::new(bytes), "[server]", &logs);

        let entries = snapshot_logs(&logs);
        assert_eq!(entries.len(), 1);
        assert!(entries[0].chars().count() <= 1001);
        assert!(entries[0].ends_with('…'));
    }

    #[test]
    fn preserves_separate_non_empty_lines() {
        let logs = new_logs();
        drain_output(Cursor::new(b"ready\r\n\nlistening\n"), "[web]", &logs);
        assert_eq!(
            snapshot_logs(&logs),
            vec!["[web] ready".to_owned(), "[web] listening".to_owned()]
        );
    }
}
