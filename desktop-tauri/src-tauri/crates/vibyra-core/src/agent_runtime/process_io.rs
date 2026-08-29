//! Reading a child's output without letting it decide how much memory to use.
//!
//! `BufRead::read_until` has no cap, so a provider that never emits a newline
//! would be answered by allocating until the app dies. And stderr is drained
//! on its own thread, because a chatty CLI that fills that pipe while we are
//! still reading stdout is a deadlock, not a slow turn.

use std::io::{BufRead, BufReader};

/// Past this, a single line is not JSON we can use — it is a runaway.
pub(super) const MAX_LINE: usize = 4 * 1024 * 1024;

/// Reads one line, refusing to grow past `MAX_LINE`.
///
/// `BufRead::read_until` has no cap, so a provider that never emits a newline
/// would be answered by allocating until the app dies. Past the cap the rest
/// of the line is drained and discarded.
pub(super) fn read_bounded(
    reader: &mut impl BufRead,
    line: &mut Vec<u8>,
) -> std::io::Result<usize> {
    let mut total = 0;
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return Ok(total);
        }
        match available.iter().position(|byte| *byte == b'\n') {
            Some(index) => {
                if line.len() < MAX_LINE {
                    line.extend_from_slice(&available[..index]);
                }
                reader.consume(index + 1);
                return Ok(total + index + 1);
            }
            None => {
                let taken = available.len();
                if line.len() < MAX_LINE {
                    line.extend_from_slice(available);
                }
                reader.consume(taken);
                total += taken;
            }
        }
    }
}

/// Drains stderr on its own thread so a chatty CLI cannot deadlock by filling
/// the pipe while we are still reading stdout.
pub(super) fn collect_stderr(stderr: std::process::ChildStderr) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut text = String::new();
        for line in BufReader::new(stderr)
            .lines()
            .map_while(Result::ok)
            .take(200)
        {
            text.push_str(line.trim());
            text.push('\n');
        }
        text.trim().chars().take(4_000).collect()
    })
}
