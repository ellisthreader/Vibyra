//! A chat started with a model its provider does not offer this account dies on
//! its first message ("not supported when using Codex with a ChatGPT account"),
//! and the person only sees a chat that will not send. The provider's own list
//! is asked before the thread starts, so the launch fails with the reason.
use super::runtime::Runtime;
use serde_json::{json, Value};

pub(super) fn offered(runtime: &Runtime, provider: &str, params: &Value) -> Result<(), String> {
    let Some(wanted) = params["model"].as_str().filter(|model| !model.is_empty()) else {
        return Ok(());
    };
    // A provider that cannot say what it offers yet is left to decide itself.
    let Ok(list) = runtime.request("model/list", json!({})) else {
        return Ok(());
    };
    if accepts(&list, wanted) {
        return Ok(());
    }
    let name = match provider {
        "claude" => "Claude",
        "gemini" => "Gemini",
        _ => "Codex",
    };
    Err(format!(
        "{wanted} is not offered to the {name} account on this Mac. Choose another model."
    ))
}

/// Matches a model, its alias's resolved model, and dotted or dashed spellings
/// (`gpt-5.6-sol`, `claude-opus-5-5`). An empty list proves nothing.
pub(super) fn accepts(list: &Value, wanted: &str) -> bool {
    let normal = |id: &str| id.trim().to_ascii_lowercase().replace('.', "-");
    let wanted = normal(wanted);
    let Some(models) = list["data"].as_array().filter(|models| !models.is_empty()) else {
        return true;
    };
    models.iter().any(|model| {
        ["model", "id", "resolvedModel"]
            .iter()
            .filter_map(|key| model[*key].as_str())
            .any(|id| normal(id) == wanted)
    })
}

#[cfg(test)]
mod tests {
    use super::accepts;
    use serde_json::json;

    #[test]
    fn a_model_is_offered_by_id_alias_or_spelling() {
        let codex = json!({"data":[{"model":"gpt-6-sol"},{"model":"gpt-5.6-sol"}]});
        assert!(accepts(&codex, "gpt-6-sol"));
        assert!(accepts(&codex, "gpt-5-6-sol"));
        assert!(!accepts(&codex, "gpt-5.4"));
        let claude = json!({"data":[{"model":"default","resolvedModel":"claude-opus-5-5"},{"model":"claude-fable-5-1"}]});
        assert!(accepts(&claude, "claude-opus-5-5"));
        assert!(accepts(&claude, "claude-fable-5-1"));
        assert!(!accepts(&claude, "claude-opus-5-fast"));
        assert!(accepts(&json!({"data":[]}), "anything"));
        assert!(accepts(&json!({}), "anything"));
    }
}
