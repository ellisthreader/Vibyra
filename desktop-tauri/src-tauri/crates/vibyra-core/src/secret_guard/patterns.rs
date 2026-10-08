//! The shape of every secret `scan` recognises. Mirrors `SecretPatterns.php`
//! in the Laravel backend rule for rule and in the same order; both are held to
//! `docs/secret-guard-vectors.json`. Every expression starts with `(?-u)` so
//! classes and `\b` work on bytes and ASCII, exactly like PCRE without `/u`.

use regex::bytes::Regex;
use std::sync::OnceLock;

/// Whole-match replacements, applied in this order (a vendor key that also
/// looks like another is named by the first).
const TOKENS: [(&str, &str); 16] = [
    (
        "private_key",
        r"(?-u)(?s)-----BEGIN [A-Z0-9 ]{0,30}PRIVATE KEY[A-Z ]{0,10}-----(?:.*?-----END [A-Z0-9 ]{0,30}PRIVATE KEY[A-Z ]{0,10}-----|.*)",
    ),
    (
        "aws_access_key",
        r"(?-u)\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b",
    ),
    (
        "github_token",
        r"(?-u)\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b",
    ),
    ("anthropic_key", r"(?-u)\bsk-ant-[A-Za-z0-9_\-]{20,200}"),
    ("openrouter_key", r"(?-u)\bsk-or-[A-Za-z0-9_\-]{20,200}"),
    (
        "openai_key",
        r"(?-u)\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\-]{32,200}",
    ),
    (
        "stripe_key",
        r"(?-u)\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,200}\b",
    ),
    ("stripe_webhook", r"(?-u)\bwhsec_[A-Za-z0-9_]{24,200}"),
    ("slack_token", r"(?-u)\bxox[abprs]-[A-Za-z0-9\-]{10,200}"),
    (
        "slack_webhook",
        r"(?-u)hooks\.slack\.com/services/[A-Z0-9]{8,}/[A-Z0-9]{8,}/[A-Za-z0-9]{16,}",
    ),
    ("google_api_key", r"(?-u)\bAIza[0-9A-Za-z_\-]{35}"),
    ("google_oauth", r"(?-u)\bya29\.[A-Za-z0-9_\-]{20,300}"),
    (
        "sendgrid_key",
        r"(?-u)\bSG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}",
    ),
    ("npm_token", r"(?-u)\bnpm_[A-Za-z0-9]{36}\b"),
    ("vibyra_key", r"(?-u)\bvyk_[A-Za-z0-9]{40}\b"),
    (
        "jwt",
        r"(?-u)\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}",
    ),
];

/// `Bearer <token>`: replaced only when the token looks random.
const BEARER: &str = r"(?-u)\b([Bb]earer)([ \t]+)([A-Za-z0-9._~+/\-]{20,})(=*)";
/// `Basic <base64>`: replaced only when the token looks random.
const BASIC: &str = r"(?-u)\b([Bb]asic)([ \t]+)([A-Za-z0-9+/]{16,})(={0,2})";
/// `scheme://user:password@host`: only the password is replaced.
const URL_PASSWORD: &str = r"(?-u)\b([A-Za-z][A-Za-z0-9+.\-]{1,20}://[^ \t\r\n\x0b\x0c:/@]{1,80}:)([^ \t\r\n\x0b\x0c@/]{3,100})(@)";
/// `name = value`, `name: value`, `"name": "value"`, `NAME=value`.
const PAIR: &str = r#"(?-u)([A-Za-z_][A-Za-z0-9_.\-]{1,63})(["']?[ \t]*[:=][ \t]*["']?)([^ \t\r\n\x0b\x0c"'`,;<>{}()\[\]\\&?]{6,400})"#;

/// Last word of a name that is a secret by itself.
pub(super) const STRONG: [&str; 14] = [
    "secret",
    "token",
    "password",
    "passwd",
    "pwd",
    "passphrase",
    "credential",
    "credentials",
    "apikey",
    "authtoken",
    "secretkey",
    "privatekey",
    "accesskey",
    "signingkey",
];
/// Last word that is a secret only next to one of `PREFIX`, or when the value looks random.
pub(super) const WEAK: [&str; 2] = ["key", "auth"];
pub(super) const PREFIX: [&str; 11] = [
    "api",
    "secret",
    "private",
    "access",
    "signing",
    "client",
    "auth",
    "encryption",
    "master",
    "license",
    "session",
];
/// A value that holds a stand-in, not a secret.
pub(super) const PLACEHOLDER_PARTS: [&str; 16] = [
    "example",
    "your",
    "changeme",
    "change_me",
    "placeholder",
    "redacted",
    "xxxx",
    "dummy",
    "sample",
    "replace",
    "insert",
    "todo",
    "process.env",
    "os.environ",
    "getenv",
    "secrets.",
];
pub(super) const PLACEHOLDER_WORDS: [&str; 12] = [
    "none",
    "null",
    "nil",
    "undefined",
    "false",
    "true",
    "string",
    "required",
    "optional",
    "default",
    "secret",
    "password",
];

pub(super) struct Compiled {
    pub tokens: Vec<(&'static str, Regex)>,
    pub bearer: Regex,
    pub basic: Regex,
    pub url_password: Regex,
    pub pair: Regex,
}

pub(super) fn compiled() -> &'static Compiled {
    static COMPILED: OnceLock<Compiled> = OnceLock::new();
    COMPILED.get_or_init(|| {
        let build = |pattern: &str| Regex::new(pattern).expect("secret guard pattern compiles");
        Compiled {
            tokens: TOKENS.iter().map(|(kind, p)| (*kind, build(p))).collect(),
            bearer: build(BEARER),
            basic: build(BASIC),
            url_password: build(URL_PASSWORD),
            pair: build(PAIR),
        }
    })
}
