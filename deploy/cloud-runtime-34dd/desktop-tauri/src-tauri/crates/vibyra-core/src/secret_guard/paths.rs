//! Files an agent's file tools refuse to read unless the person allowed them
//! for that project: `.env*`, private keys, cloud and package credentials.
//! Judged by name only, case-insensitively; `\` counts as a separator.
//! Mirrors `SensitivePaths.php`.

const DIRECTORIES: [&str; 7] = [
    ".ssh",
    ".aws",
    ".gnupg",
    ".kube",
    ".azure",
    ".gcloud",
    ".password-store",
];
const EXACT: [&str; 28] = [
    ".envrc",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    ".npmrc",
    ".pypirc",
    ".netrc",
    "_netrc",
    ".pgpass",
    ".git-credentials",
    ".htpasswd",
    ".dockercfg",
    "credentials",
    "credentials.json",
    "credentials.yaml",
    "credentials.yml",
    "secrets.json",
    "secrets.yaml",
    "secrets.yml",
    "secrets.toml",
    "secrets.env",
    "service-account.json",
    "serviceaccount.json",
    "kubeconfig",
    "terraform.tfstate",
    "terraform.tfstate.backup",
    "master.key",
];
const EXTENSIONS: [&str; 9] = [
    "pem", "key", "p12", "pfx", "jks", "keystore", "kdbx", "tfvars", "ovpn",
];
/// `.env.example` and friends hold names, not values.
const TEMPLATES: [&str; 5] = ["example", "sample", "template", "dist", "defaults"];

pub fn sensitive_path(path: &str) -> bool {
    let lowered = path.to_ascii_lowercase().replace('\\', "/");
    let parts: Vec<&str> = lowered
        .split('/')
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    let Some((name, directories)) = parts.split_last() else {
        return false;
    };
    let name = *name;
    if directories.iter().any(|d| DIRECTORIES.contains(d)) {
        return true;
    }
    if DIRECTORIES.contains(&name) || EXACT.contains(&name) {
        return true;
    }
    if name == ".env"
        || name
            .strip_prefix(".env.")
            .is_some_and(|rest| !TEMPLATES.contains(&rest))
    {
        return true;
    }
    if name.ends_with(".json")
        && (name.starts_with("service-account") || name.starts_with("client_secret"))
    {
        return true;
    }
    match name.rfind('.') {
        Some(dot) if dot > 0 => EXTENSIONS.contains(&&name[dot + 1..]),
        _ => false,
    }
}
