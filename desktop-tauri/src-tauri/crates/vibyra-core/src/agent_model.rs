//! The small value types Agent Mode shares, and the one rule they all follow.
//!
//! Every one of these round-trips through SQLite as its own lowercase name
//! rather than as an integer, so a database opened by hand reads as English
//! and adding a variant never renumbers the ones already stored.
//!
//! They all parse permissively and fall back to their *safest* value, which is
//! the important half. A row written by a newer build, a hand-edited settings
//! file and a corrupt byte all arrive here as an unknown string, and the
//! answer to "I don't recognise this permission" must be `Plan`, never `Full`.

use serde::{Deserialize, Serialize};

/// Which structured CLI runs a chat.
///
/// Named separately from `AgentSpec` (the launchable terminal runtime) on
/// purpose: only these two speak a normalized JSON event stream, and a chat
/// bound to one cannot be resumed by the other.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Engine {
    Claude,
    Codex,
}

impl Engine {
    pub fn as_str(self) -> &'static str {
        match self {
            Engine::Claude => "claude",
            Engine::Codex => "codex",
        }
    }

    /// Unknown reads as Claude — the engine whose session id Vibyra mints
    /// itself, so a mislabelled chat can still be addressed rather than being
    /// stuck waiting for an id a dead provider never reported.
    pub fn parse(value: &str) -> Self {
        match value {
            "codex" => Engine::Codex,
            _ => Engine::Claude,
        }
    }
}

/// How much authority a turn runs with.
///
/// Three levels, not a matrix. Each maps to provider-native controls in the
/// adapters; none of them is a bypass flag. `Full` is a standing grant the
/// user makes in Vibyra and can revoke there, which is why it is a stored
/// value on the profile rather than a flag on the command line only.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// Read and reason. No writes, no commands with effects.
    Plan,
    /// Write inside granted places; everything outward still asks.
    Standard,
    /// Write anywhere granted, with provider sandboxing relaxed. Still never
    /// authorises publish, spend, or secret access on its own.
    Full,
}

impl PermissionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            PermissionMode::Plan => "plan",
            PermissionMode::Standard => "standard",
            PermissionMode::Full => "full",
        }
    }

    /// Unknown reads as `Plan`. A permission that cannot be understood is not
    /// a permission.
    pub fn parse(value: &str) -> Self {
        match value {
            "standard" => PermissionMode::Standard,
            "full" => PermissionMode::Full,
            _ => PermissionMode::Plan,
        }
    }

    /// Whether this level may write at all, which is the question the place
    /// grants and the approval broker both actually ask.
    pub fn writes(self) -> bool {
        !matches!(self, PermissionMode::Plan)
    }
}

/// What an agent may do with a granted folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaceAccess {
    Read,
    ReadWrite,
}

impl PlaceAccess {
    pub fn as_str(self) -> &'static str {
        match self {
            PlaceAccess::Read => "read",
            PlaceAccess::ReadWrite => "readWrite",
        }
    }

    /// Unknown reads as read-only, for the same reason unknown permission
    /// reads as `Plan`.
    pub fn parse(value: &str) -> Self {
        match value {
            "readWrite" => PlaceAccess::ReadWrite,
            _ => PlaceAccess::Read,
        }
    }
}

/// Whether an agent may propose durable memory from what it just did.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Reflection {
    /// Nothing is extracted.
    Off,
    /// Entries are proposed and wait for the user.
    Suggest,
    /// Low-risk entries commit themselves; contradictions and anything
    /// sensitive still wait. See `agent_memory::reflect`.
    Automatic,
}

impl Reflection {
    pub fn as_str(self) -> &'static str {
        match self {
            Reflection::Off => "off",
            Reflection::Suggest => "suggest",
            Reflection::Automatic => "automatic",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "off" => Reflection::Off,
            "automatic" => Reflection::Automatic,
            _ => Reflection::Suggest,
        }
    }
}

/// Why a chat exists. Drives what the transcript header says and which chats
/// a routine is allowed to reuse (none — every run opens its own).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ChatSource {
    User,
    Routine,
    Handoff,
}

impl ChatSource {
    pub fn as_str(self) -> &'static str {
        match self {
            ChatSource::User => "user",
            ChatSource::Routine => "routine",
            ChatSource::Handoff => "handoff",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "routine" => ChatSource::Routine,
            "handoff" => ChatSource::Handoff,
            _ => ChatSource::User,
        }
    }
}
