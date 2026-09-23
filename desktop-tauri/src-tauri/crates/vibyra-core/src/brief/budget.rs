//! The only place a brief is cut.
//!
//! Sections render at full length and hand their text here. This drops the
//! empty ones outright — a bare `Memory:` header reads as "there is context
//! here" when there is none, which is how the chat learned to bluff — fits
//! each survivor to its cap, then gives whatever is left to the elastic
//! sections in one pass so the result is the same every time.

/// Whole-brief ceiling. Every character of it comes out of the conversation
/// history, not out of the price of a call.
pub const TOTAL_CHARS: usize = 3_200;

const MARKER: &str = "\n…[trimmed by Vibyra]";
const JOIN: &str = "\n\n";

pub(super) struct Section {
    pub name: &'static str,
    pub text: String,
    pub cap: usize,
    /// 0 never grows. Higher numbers take slack first.
    pub grow: u8,
}

pub(super) fn section(name: &'static str, text: String, cap: usize, grow: u8) -> Section {
    Section {
        name,
        text,
        cap,
        grow,
    }
}

/// Returns the joined brief and the names of the sections that lost text.
pub(super) fn assemble(sections: Vec<Section>) -> (String, Vec<String>) {
    let mut kept: Vec<Section> = sections
        .into_iter()
        .filter(|section| !section.text.trim().is_empty())
        .collect();

    // A capped section renders at no more than its cap, so costing the plan at
    // `min(len, cap)` can only under-count the slack, never overspend it.
    let separators = kept.len().saturating_sub(1) * JOIN.len();
    let planned: usize = kept.iter().map(|s| s.text.len().min(s.cap)).sum();
    let mut slack = TOTAL_CHARS.saturating_sub(planned + separators);

    let mut growable: Vec<usize> = (0..kept.len())
        .filter(|index| kept[*index].grow > 0)
        .collect();
    growable.sort_by_key(|index| std::cmp::Reverse(kept[*index].grow));
    for index in growable {
        let wanted = kept[index].text.len().saturating_sub(kept[index].cap);
        let extra = wanted.min(slack);
        kept[index].cap += extra;
        slack -= extra;
    }

    let mut truncated = Vec::new();
    let parts: Vec<String> = kept
        .into_iter()
        .map(|section| match fit(&section.text, section.cap) {
            Some(cut) => {
                truncated.push(section.name.to_string());
                cut
            }
            None => section.text,
        })
        .collect();
    let text = parts.join(JOIN);
    let clamped = fit(&text, TOTAL_CHARS);
    (clamped.unwrap_or(text), truncated)
}

/// Mirrors `commands/ai.rs::truncate`: walk back to a character boundary so a
/// multi-byte character is never split. Unlike that one the marker is paid for
/// inside the cap, so a section that says it fits really does.
fn fit(text: &str, cap: usize) -> Option<String> {
    if text.len() <= cap {
        return None;
    }
    let mut cut = cap.saturating_sub(MARKER.len()).min(text.len());
    while cut > 0 && !text.is_char_boundary(cut) {
        cut -= 1;
    }
    Some(format!("{}{MARKER}", &text[..cut]))
}
