//! Files that must never be committed by a hand-off or a cloud sync, judged by name; contents are judged by `scan`.
//! Moved here from the desktop `cloud_git/secrets.rs`, which re-exports it.
pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;

/// Why a path looks like it holds a secret, or `None` when it looks ordinary.
pub fn secret_reason(path: &str) -> Option<&'static str> {
    secret_reason_with(path, false)
}

/// The reason given to `.env`-type files; with `include_env` these are let through (private keys, credential
/// files and anything else on the denylist, and every content match in `scan`, stay held back regardless).
pub const ENV_REASON: &str = "environment file";

/// `secret_reason` with the opt-in for environment files.
pub fn secret_reason_with(path: &str, include_env: bool) -> Option<&'static str> {
    match secret_reason_inner(path) {
        Some(ENV_REASON) if include_env => None,
        other => other,
    }
}

fn secret_reason_inner(path: &str) -> Option<&'static str> {
    let lower = path.to_ascii_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(&lower);
    let templated = ["example", "sample", "template", "dist", "defaults"];
    if name == ".env"
        || name.starts_with(".env.")
        || name.ends_with(".env")
        || name == ".envrc"
        || name.starts_with(".envrc.")
    {
        if templated.iter().any(|t| name.ends_with(t)) {
            return None;
        }
        return Some(ENV_REASON);
    }
    if lower.split('/').any(|part| {
        matches!(
            part,
            ".ssh" | ".aws" | ".gnupg" | ".kube" | ".azure" | ".terraform"
        )
    }) {
        return Some("credentials folder");
    }
    if lower.ends_with(".docker/config.json") || lower.contains(".config/gcloud/") {
        return Some("credentials file");
    }
    if name.ends_with(".tfvars")
        || name.ends_with(".tfvars.json")
        || name.starts_with("terraform.tfstate")
    {
        return Some("infrastructure secrets or state");
    }
    if (name.starts_with("service-account") || name.starts_with("serviceaccount"))
        && name.ends_with(".json")
    {
        return Some("credentials file");
    }
    let key_ext = [
        ".pem",
        ".key",
        ".p12",
        ".pfx",
        ".keystore",
        ".jks",
        ".ppk",
        ".asc",
    ];
    if key_ext.iter().any(|e| name.ends_with(e)) {
        return Some("private key or certificate");
    }
    let key_names = ["id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"];
    if key_names.iter().any(|k| name.starts_with(k)) && !name.ends_with(".pub") {
        return Some("private key");
    }
    if matches!(
        name,
        ".npmrc"
            | ".netrc"
            | ".pypirc"
            | ".git-credentials"
            | ".htpasswd"
            | "credentials.json"
            | "application_default_credentials.json"
            | "client_secret.json"
            | "service-account.json"
            | "secrets.json"
            | "secrets.yml"
            | "secrets.yaml"
    ) {
        return Some("credentials file");
    }
    None
}
