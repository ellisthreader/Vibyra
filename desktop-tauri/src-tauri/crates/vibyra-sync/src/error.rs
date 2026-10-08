//! One error type for the whole crate. Messages never carry tokens, keys or file contents.
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum SyncError {
    /// A local file or directory operation failed.
    Io(String),
    /// `git` failed or is unavailable.
    Git(String),
    /// A sealed stream was malformed or failed authentication.
    Crypto(&'static str),
    /// The account service answered `{ok:false, code, message}`.
    Api {
        status: u16,
        code: String,
        message: String,
    },
    /// Transport failure or 5xx after the retries.
    Network(String),
    /// 401/403 without a more specific code: the session token is no longer valid.
    Unauthorized(String),
    /// Something the caller must fix or wait for (bad base URL, no project folder, ...).
    Invalid(String),
}

pub type Result<T> = std::result::Result<T, SyncError>;

impl SyncError {
    /// The API `code` of an `Api` error, e.g. `seq_conflict`, `quota_exceeded`.
    pub fn code(&self) -> Option<&str> {
        match self {
            SyncError::Api { code, .. } => Some(code),
            _ => None,
        }
    }
}

impl fmt::Display for SyncError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SyncError::Io(m)
            | SyncError::Git(m)
            | SyncError::Network(m)
            | SyncError::Invalid(m) => f.write_str(m),
            SyncError::Unauthorized(m) => f.write_str(m),
            SyncError::Crypto(m) => write!(f, "sealed data rejected: {m}"),
            SyncError::Api { message, code, .. } => write!(f, "{message} ({code})"),
        }
    }
}

impl std::error::Error for SyncError {}

impl From<std::io::Error> for SyncError {
    fn from(e: std::io::Error) -> Self {
        SyncError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for SyncError {
    fn from(e: serde_json::Error) -> Self {
        SyncError::Io(format!("bad JSON: {e}"))
    }
}

pub(crate) fn io_at(what: &str, path: &std::path::Path, e: std::io::Error) -> SyncError {
    SyncError::Io(format!("{what} {}: {e}", path.display()))
}
