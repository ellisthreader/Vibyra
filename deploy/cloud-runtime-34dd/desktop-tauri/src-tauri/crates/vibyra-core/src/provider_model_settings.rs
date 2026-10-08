use serde::{Deserialize, Serialize};

/// No credentials: keys live only in the OS credential store.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProviderModelSettings {
    pub enabled: bool,
    pub provider: String,
    pub model: String,
}
