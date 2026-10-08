use serde_json::Value;
use std::path::Path;
use vibyra_core::preview::PreviewTarget;

/// The package script behind `npm run <script>`, shown with the command.
pub(super) fn script_body(root: &Path, target: &PreviewTarget) -> Option<String> {
    let words = target
        .command
        .as_deref()?
        .split_whitespace()
        .collect::<Vec<_>>();
    let script = match words.as_slice() {
        ["yarn", "run", script, ..] | [_, "run", script, ..] => *script,
        ["yarn", script, ..] => *script,
        _ => return None,
    };
    let text =
        std::fs::read_to_string(root.join(&target.relative_root).join("package.json")).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value["scripts"][script].as_str().map(str::to_owned)
}
