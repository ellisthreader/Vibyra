//! What can go wrong with a local MCP server, in words a person can act on.
//! `reason()` is the short machine code the Mac runner reports to the backend.

use std::fmt;
use std::time::Duration;

#[derive(Debug, Clone, PartialEq)]
pub enum McpError {
    /// The settings entry is not usable (empty command, forbidden variable, ...).
    Invalid(String),
    /// The program could not be started.
    Spawn(String),
    /// The server did not finish its handshake in time, or spoke an unknown protocol.
    Handshake(String),
    /// No answer within the call's time limit; the server was stopped.
    Timeout(Duration),
    /// The server exited or closed its output before answering.
    Crashed(String),
    /// A single message was larger than the cap.
    TooLarge(usize),
    /// The server answered with a JSON-RPC error.
    Rpc { code: i64, message: String },
    /// The server asked for something Vibyra does not offer (sampling, input).
    Unsupported(String),
    /// Restarting too soon after a crash, or stopped after repeated crashes.
    Unavailable {
        retry_after: Option<Duration>,
        detail: String,
    },
    /// Not configured, or switched off.
    Disabled,
    /// The keychain could not be read.
    Secret(String),
}

impl McpError {
    pub fn reason(&self) -> &'static str {
        match self {
            Self::Invalid(_) => "invalid",
            Self::Spawn(_) => "unavailable",
            Self::Handshake(_) => "unavailable",
            Self::Timeout(_) => "timeout",
            Self::Crashed(_) => "crashed",
            Self::TooLarge(_) => "too_large",
            Self::Rpc { .. } => "rpc_error",
            Self::Unsupported(_) => "unsupported",
            Self::Unavailable { .. } => "unavailable",
            Self::Disabled => "disabled",
            Self::Secret(_) => "secret",
        }
    }
}

impl McpError {
    /// The same error with every secret value hidden in its text.
    pub fn redacted(self, secrets: &[String]) -> Self {
        use super::redact::redact as hide;
        match self {
            Self::Invalid(t) => Self::Invalid(hide(&t, secrets)),
            Self::Spawn(t) => Self::Spawn(hide(&t, secrets)),
            Self::Handshake(t) => Self::Handshake(hide(&t, secrets)),
            Self::Crashed(t) => Self::Crashed(hide(&t, secrets)),
            Self::Rpc { code, message } => Self::Rpc {
                code,
                message: hide(&message, secrets),
            },
            Self::Unsupported(t) => Self::Unsupported(hide(&t, secrets)),
            Self::Unavailable {
                retry_after,
                detail,
            } => Self::Unavailable {
                retry_after,
                detail: hide(&detail, secrets),
            },
            other => other,
        }
    }
}

impl fmt::Display for McpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Invalid(why) | Self::Spawn(why) | Self::Handshake(why) => f.write_str(why),
            Self::Timeout(after) => write!(
                f,
                "The server did not answer within {} seconds and was stopped.",
                after.as_secs()
            ),
            Self::Crashed(why) => write!(f, "The server stopped while working. {why}"),
            Self::TooLarge(cap) => write!(f, "The server sent a message over {cap} bytes."),
            Self::Rpc { message, .. } => write!(f, "The server refused: {message}"),
            Self::Unsupported(why) => f.write_str(why),
            Self::Unavailable { detail, .. } => f.write_str(detail),
            Self::Disabled => f.write_str("This server is switched off on this Mac."),
            Self::Secret(why) => write!(f, "A saved secret could not be read: {why}"),
        }
    }
}

impl std::error::Error for McpError {}
