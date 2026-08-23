//! Sanitises the optional terminal tail before it leaves the machine.

/// Terminal output is the single most useful thing in a report and the single
/// most likely to be enormous, so only the tail travels.
const MAX_TAIL_LINES: usize = 120;
const MAX_TAIL_BYTES: usize = 40_000;

/// Keeps the end of a terminal's scrollback, readable.
///
/// Two things have to go: the escape sequences, which turn a text file into
/// line noise, and the volume — a build loop's output would dwarf the report
/// it is attached to. The tail is kept because the failure is at the end.
pub(crate) fn terminal_tail(snapshot: &str) -> String {
    let plain = strip_ansi(snapshot);
    let lines: Vec<&str> = plain.lines().collect();
    let start = lines.len().saturating_sub(MAX_TAIL_LINES);
    let mut tail = lines[start..].join("\n");
    if tail.len() > MAX_TAIL_BYTES {
        let mut cut = tail.len() - MAX_TAIL_BYTES;
        while cut < tail.len() && !tail.is_char_boundary(cut) {
            cut += 1;
        }
        tail = tail[cut..].to_owned();
    }
    tail.trim_end().to_owned()
}

/// Strips CSI/OSC escape sequences and carriage returns.
///
/// Deliberately a scanner rather than a regex: a progress bar rewriting itself
/// with `\r` leaves the line duplicated dozens of times, and dropping the
/// carriage returns collapses it back to what the user actually saw.
fn strip_ansi(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(current) = chars.next() {
        match current {
            '\r' => continue,
            '\u{1b}' => {
                match chars.peek() {
                    // CSI: runs until a byte in the @-~ range.
                    Some('[') => {
                        chars.next();
                        for inner in chars.by_ref() {
                            if ('\u{40}'..='\u{7e}').contains(&inner) {
                                break;
                            }
                        }
                    }
                    // OSC: runs until BEL or the ESC of a String Terminator.
                    Some(']') => {
                        chars.next();
                        for inner in chars.by_ref() {
                            if inner == '\u{7}' || inner == '\u{1b}' {
                                break;
                            }
                        }
                    }
                    // Any other two-character escape.
                    Some(_) => {
                        chars.next();
                    }
                    None => break,
                }
            }
            _ => out.push(current),
        }
    }
    out
}
