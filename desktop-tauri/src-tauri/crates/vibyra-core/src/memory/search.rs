use std::fs;
use std::path::{Path, PathBuf};

use crate::parallel::map_parallel;
use crate::CoreResult;

use super::notes::{collect_note_paths, read_bounded, relative_note_path};
use super::MemorySnippet;

const MAX_SEARCH_NOTES: usize = 1_200;
const MAX_SEARCH_NOTE_BYTES: u64 = 128 * 1024;
const MAX_SEARCH_TOTAL_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SNIPPET_CHARS: usize = 2_200;
const MAX_RESULTS: usize = 4;
const STOP_WORDS: &[&str] = &[
    "about", "after", "again", "also", "and", "are", "can", "for", "from", "help", "how", "into",
    "our", "please", "that", "the", "this", "use", "what", "when", "with", "you", "your",
];

pub fn search_vault(root: &Path, query: &str) -> CoreResult<Vec<MemorySnippet>> {
    let tokens = query_tokens(query);
    if tokens.is_empty() {
        return Ok(Vec::new());
    }
    let selected = within_budget(collect_note_paths(root, MAX_SEARCH_NOTES)?);

    // Reading and scoring up to 1,200 notes is the slow half of a vault
    // search and every note is independent, so fan it out. A note that
    // cannot be read is skipped rather than failing the whole search, which
    // matches how an unreadable note was already treated by the size check.
    let scored = map_parallel(&selected, |path| {
        let content = read_bounded(path, MAX_SEARCH_NOTE_BYTES).ok().flatten()?;
        let relative = relative_note_path(root, path);
        let score = relevance_score(&relative, &content, &tokens);
        (score > 0).then(|| (score, relative, matching_excerpt(&content, &tokens)))
    });

    let mut matches: Vec<_> = scored.into_iter().flatten().collect();
    matches.sort_by(|left, right| {
        right.0.cmp(&left.0).then_with(|| {
            left.1
                .to_ascii_lowercase()
                .cmp(&right.1.to_ascii_lowercase())
        })
    });
    Ok(matches
        .into_iter()
        .take(MAX_RESULTS)
        .map(|(_, path, content)| MemorySnippet { path, content })
        .collect())
}

/// Picks the notes the byte budget allows, in directory order.
///
/// The budget has to be spent sequentially: deciding it inside the parallel
/// pass would make the result depend on which thread finished first, so which
/// notes a search covers would vary run to run.
fn within_budget(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut read_bytes = 0u64;
    paths
        .into_iter()
        .filter(|path| {
            let size = fs::metadata(path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            if size == 0
                || size > MAX_SEARCH_NOTE_BYTES
                || read_bytes + size > MAX_SEARCH_TOTAL_BYTES
            {
                return false;
            }
            read_bytes += size;
            true
        })
        .collect()
}

fn query_tokens(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    for token in query
        .to_lowercase()
        .split(|character: char| !character.is_alphanumeric())
        .filter(|token| token.chars().count() >= 3 && !STOP_WORDS.contains(token))
    {
        if !tokens.iter().any(|existing| existing == token) {
            tokens.push(token.to_string());
        }
        if tokens.len() == 12 {
            break;
        }
    }
    tokens
}

fn relevance_score(path: &str, content: &str, tokens: &[String]) -> usize {
    let path = path.to_lowercase();
    let content = content.to_lowercase();
    tokens
        .iter()
        .map(|token| {
            let path_score = usize::from(path.contains(token)) * 12;
            let content_score = content.matches(token).count().min(5) * 2;
            path_score + content_score
        })
        .sum()
}

fn matching_excerpt(content: &str, tokens: &[String]) -> String {
    let mut selected: Vec<String> = Vec::new();
    // Running total rather than re-joining the accumulator on every line.
    // The join made excerpt building quadratic in the number of matching
    // lines, so the notes that matched a query best were the slowest.
    let mut length = 0usize;
    if let Some(heading) = content
        .lines()
        .find(|line| line.trim_start().starts_with('#'))
    {
        let heading = heading.trim().to_string();
        length += heading.chars().count();
        selected.push(heading);
    }
    for line in content.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();
        if !trimmed.is_empty()
            && tokens.iter().any(|token| lower.contains(token))
            && !selected.iter().any(|existing| existing == trimmed)
        {
            length += trimmed.chars().count() + usize::from(!selected.is_empty());
            selected.push(trimmed.to_string());
        }
        if length >= MAX_SNIPPET_CHARS {
            break;
        }
    }
    if selected.is_empty() {
        selected.extend(
            content
                .lines()
                .filter(|line| !line.trim().is_empty())
                .take(8)
                .map(str::to_string),
        );
    }
    selected
        .join("\n")
        .chars()
        .take(MAX_SNIPPET_CHARS)
        .collect()
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn ranks_relevant_notes_and_returns_only_relative_paths() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir(temp.path().join(".obsidian")).unwrap();
        fs::create_dir(temp.path().join("Architecture")).unwrap();
        fs::write(
            temp.path().join("Architecture/Terminal.md"),
            "# Terminal architecture\nPTY sessions persist across reloads.",
        )
        .unwrap();
        fs::write(temp.path().join("Recipes.md"), "# Soup\nUse carrots.").unwrap();
        let results = search_vault(temp.path(), "How do terminal PTY sessions persist?").unwrap();
        assert_eq!(results[0].path, "Architecture/Terminal.md");
        assert!(!results[0]
            .path
            .contains(temp.path().to_string_lossy().as_ref()));
    }
}
