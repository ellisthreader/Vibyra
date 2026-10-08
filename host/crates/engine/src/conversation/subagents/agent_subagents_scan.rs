//! What one Claude or Codex transcript says about a subagent: when it ran,
//! what it is doing, which files it edited, its tokens, and which subagents it
//! saw finish. Read incrementally, so a poll parses only appended lines.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;

use serde_json::Value;

use super::agent_subagents_describe::{describe, tag};

/// A transcript past this many unread bytes is left alone instead of stalling the panel.
const READ_CAP: u64 = 128 << 20;
const FILE_LIMIT: usize = 40;
pub(super) const EDIT_TOOLS: [&str; 4] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

#[derive(Clone, Debug, PartialEq)]
pub struct Finish {
    pub at: String,
    pub status: String,
}

#[derive(Default)]
pub struct Activity {
    offset: u64,
    pub model: Option<String>,
    pub first_at: Option<String>,
    pub last_at: Option<String>,
    pub files: Vec<String>,
    /// Each edited path with the time it was last written, newest last.
    pub touched: Vec<(String, String)>,
    pub doing: Option<String>,
    /// Codex only: a turn has started and not yet completed.
    pub working: bool,
    pub head: Option<Value>,
    calls: HashSet<String>,
    /// Subagent id or tool-use id → how and when it last finished.
    pub finished: HashMap<String, Finish>,
}

impl Activity {
    pub fn advance(&mut self, path: &Path, codex: bool) -> Result<(), String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let length = file.metadata().map_err(|e| e.to_string())?.len();
        if length < self.offset {
            *self = Self::default();
        }
        if length - self.offset > READ_CAP {
            return Err("This transcript is too large to read here.".into());
        }
        file.seek(SeekFrom::Start(self.offset))
            .map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(file);
        let mut line = Vec::new();
        loop {
            line.clear();
            let read = reader
                .read_until(b'\n', &mut line)
                .map_err(|e| e.to_string())?;
            // A last line without its newline is still being written.
            if read == 0 || line.last() != Some(&b'\n') {
                break;
            }
            self.offset += read as u64;
            let Ok(text) = std::str::from_utf8(&line) else {
                continue;
            };
            let Ok(event) = serde_json::from_str::<Value>(text) else {
                continue;
            };
            if let Some(at) = event["timestamp"].as_str() {
                self.first_at.get_or_insert_with(|| at.to_owned());
                self.last_at = Some(at.to_owned());
            }
            if text.contains("<task-notification>") {
                self.notification(text, &event);
            }
            if codex {
                self.codex_event(text, &event);
            } else {
                self.claude_event(&event);
            }
        }
        Ok(())
    }

    pub(super) fn edited(&mut self, path: &str) {
        let path = path.trim();
        if !path.is_empty()
            && self.files.len() < FILE_LIMIT
            && !self.files.iter().any(|f| f == path)
        {
            self.files.push(path.to_owned());
        }
        if let (false, Some(at)) = (path.is_empty(), self.last_at.clone()) {
            self.touched.retain(|(seen, _)| seen != path);
            if self.touched.len() >= FILE_LIMIT {
                self.touched.remove(0);
            }
            self.touched.push((path.to_owned(), at));
        }
    }

    fn finish(&mut self, id: &str, at: &Value, status: &str) {
        let at = at.as_str().unwrap_or_default().to_owned();
        self.finished.insert(
            id.to_owned(),
            Finish {
                at,
                status: status.to_owned(),
            },
        );
    }

    /// Background subagents report back with a `<task-notification>` block.
    fn notification(&mut self, text: &str, event: &Value) {
        let body = event["content"]
            .as_str()
            .or(event["message"]["content"].as_str())
            .unwrap_or(text);
        let status = tag(body, "status").unwrap_or("completed").to_owned();
        for id in [tag(body, "task-id"), tag(body, "tool-use-id")]
            .into_iter()
            .flatten()
        {
            self.finish(id, &event["timestamp"], &status);
        }
    }

    fn claude_event(&mut self, event: &Value) {
        let Some(blocks) = event["message"]["content"].as_array() else {
            return;
        };
        if event["type"] == "assistant" {
            self.model = event["message"]["model"].as_str().map(str::to_owned);
        }
        for block in blocks {
            let input = &block["input"];
            match block["type"].as_str() {
                Some("tool_use") => {
                    let name = block["name"].as_str().unwrap_or_default();
                    if EDIT_TOOLS.contains(&name) {
                        let path = input["file_path"]
                            .as_str()
                            .or(input["notebook_path"].as_str());
                        path.into_iter().for_each(|path| self.edited(path));
                    }
                    if matches!(name, "Agent" | "Task") {
                        self.calls.extend(block["id"].as_str().map(str::to_owned));
                    }
                    self.doing = Some(describe(name, input));
                }
                // A foreground subagent's answer is the result of its own call;
                // a background one's is only "launched", and it reports later.
                Some("tool_result") => {
                    let Some(id) = block["tool_use_id"]
                        .as_str()
                        .filter(|id| self.calls.contains(*id))
                    else {
                        continue;
                    };
                    if !block["content"]
                        .to_string()
                        .contains("Async agent launched")
                    {
                        let status = if block["is_error"] == true {
                            "failed"
                        } else {
                            "completed"
                        };
                        self.finish(id, &event["timestamp"], status);
                    }
                }
                _ => {}
            }
        }
    }
}
