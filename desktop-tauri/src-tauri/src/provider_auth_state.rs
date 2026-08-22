use serde::Serialize;
use vibyra_core::agents::program_in_path;

#[derive(Clone, Copy)]
pub struct ProviderDefinition {
    pub id: &'static str,
    pub company: &'static str,
    pub product: &'static str,
    pub runtime_id: &'static str,
    pub program: &'static str,
    /// npm package that provides `program`. Every account CLI ships on npm,
    /// which is what lets this pane install one rather than tell the user to
    /// go and do it somewhere else.
    pub package: &'static str,
}

#[derive(Clone, Default)]
pub struct AuthSnapshot {
    pub connected: bool,
    pub probe_failed: bool,
    pub account_label: String,
    pub detail: String,
}

impl AuthSnapshot {
    pub fn failed() -> Self {
        Self {
            probe_failed: true,
            ..Self::default()
        }
    }
}

/// One account under one provider.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountView {
    /// Which account this is within its provider. `"default"` is the login the
    /// user already had before extra accounts existed.
    pub account_id: String,
    pub status: String,
    pub account_label: String,
    pub detail: String,
    pub sign_in_page_available: bool,
    /// What the CLI is asking for right now; empty when it is not waiting on
    /// anyone. The row turns this into a reply box — a sign-in that ends with
    /// "paste the code" cannot complete without one.
    pub prompt: String,
    /// False for the account that uses the CLI's own folder. It can be signed
    /// out but never deleted: that folder is not Vibyra's to remove.
    pub removable: bool,
}

/// One company, with every account held for it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderView {
    pub id: String,
    pub company: String,
    pub product: String,
    pub runtime_id: String,
    pub installed: bool,
    /// The npm package the Install action fetches. Shown so the card can name
    /// the command it is about to run instead of installing something opaque.
    pub package: String,
    pub accounts: Vec<ProviderAccountView>,
    /// False once the per-provider ceiling is reached, so the Add button can
    /// say why rather than failing on click.
    pub can_add_account: bool,
}

pub const PROVIDERS: [ProviderDefinition; 3] = [
    ProviderDefinition {
        id: "codex",
        company: "OpenAI",
        product: "ChatGPT",
        runtime_id: "codex",
        program: "codex",
        package: "@openai/codex",
    },
    ProviderDefinition {
        id: "claude",
        company: "Anthropic",
        product: "Claude",
        runtime_id: "claude",
        program: "claude",
        package: "@anthropic-ai/claude-code",
    },
    ProviderDefinition {
        id: "gemini",
        company: "Google",
        product: "Gemini",
        runtime_id: "gemini",
        program: "gemini",
        package: "@google/gemini-cli",
    },
];

pub fn definition(id: &str) -> Option<ProviderDefinition> {
    PROVIDERS.iter().copied().find(|provider| provider.id == id)
}

pub fn installed(provider: ProviderDefinition) -> bool {
    program_in_path(provider.program)
}
