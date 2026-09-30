//! The first Data chunk in each direction of an upgraded Preview stream.
//! Later chunks are opaque WebSocket wire bytes, governed by Preview credit.
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use vibyra_transport::preview::MAX_CHUNK;

const MAX_HEADERS: usize = 64;
const MAX_HEADER_BYTES: usize = 12 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct UpgradeRequest {
    pub v: u8,
    pub kind: String,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct UpgradeResponse {
    pub v: u8,
    pub status: u16,
    pub headers: HashMap<String, String>,
}

impl UpgradeRequest {
    pub fn decode(bytes: &[u8]) -> Result<Self, String> {
        let request: Self = decode_metadata(bytes)?;
        request.validate()?;
        Ok(request)
    }

    pub fn encode(&self) -> Result<Vec<u8>, String> {
        self.validate()?;
        encode_metadata(self)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.v != 1 || self.kind != "upgrade" || self.method != "GET" {
            return Err("Unsupported Preview upgrade request".into());
        }
        if self.path.len() > 4096
            || !self.path.starts_with('/')
            || self.path.starts_with("//")
            || self.path.contains('\\')
            || self.path.contains('#')
            || self.path.bytes().any(|b| b <= b' ' || b == 127)
        {
            return Err("Invalid Preview upgrade path".into());
        }
        validate_headers(&self.headers)?;
        if !header_token(&self.headers, "upgrade", "websocket")
            || !header_token(&self.headers, "connection", "upgrade")
            || header(&self.headers, "sec-websocket-version") != Some("13")
            || !header(&self.headers, "sec-websocket-key")
                .and_then(|key| base64::engine::general_purpose::STANDARD.decode(key).ok())
                .is_some_and(|key| key.len() == 16)
        {
            return Err("Invalid Preview WebSocket handshake".into());
        }
        Ok(())
    }
}

impl UpgradeResponse {
    pub fn decode(bytes: &[u8]) -> Result<Self, String> {
        let response: Self = decode_metadata(bytes)?;
        response.validate()?;
        Ok(response)
    }

    pub fn encode(&self) -> Result<Vec<u8>, String> {
        self.validate()?;
        encode_metadata(self)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.v != 1 || self.status != 101 {
            return Err("Preview upstream did not upgrade".into());
        }
        validate_headers(&self.headers)?;
        if !header_token(&self.headers, "upgrade", "websocket")
            || !header_token(&self.headers, "connection", "upgrade")
            || !header(&self.headers, "sec-websocket-accept")
                .and_then(|value| base64::engine::general_purpose::STANDARD.decode(value).ok())
                .is_some_and(|value| value.len() == 20)
        {
            return Err("Invalid Preview WebSocket upgrade response".into());
        }
        Ok(())
    }
}

fn decode_metadata<T: for<'de> Deserialize<'de>>(bytes: &[u8]) -> Result<T, String> {
    if bytes.is_empty() || bytes.len() > MAX_CHUNK {
        return Err("Preview upgrade metadata exceeds one chunk".into());
    }
    serde_json::from_slice(bytes).map_err(|_| "Invalid Preview upgrade metadata".into())
}

fn encode_metadata<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec(value).map_err(|_| "Invalid Preview upgrade metadata")?;
    if bytes.len() > MAX_CHUNK {
        return Err("Preview upgrade metadata exceeds one chunk".into());
    }
    Ok(bytes)
}

fn validate_headers(headers: &HashMap<String, String>) -> Result<(), String> {
    if headers.len() > MAX_HEADERS
        || headers
            .iter()
            .map(|(name, value)| name.len().saturating_add(value.len()))
            .sum::<usize>()
            > MAX_HEADER_BYTES
    {
        return Err("Preview upgrade headers exceed limit".into());
    }
    let mut unique = HashSet::new();
    for (name, value) in headers {
        if !unique.insert(name.to_ascii_lowercase()) {
            return Err("Duplicate Preview upgrade header".into());
        }
        if name.is_empty()
            || !name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&b))
            || value
                .bytes()
                .any(|b| b != b'\t' && !(b' '..=b'~').contains(&b))
        {
            return Err("Invalid Preview upgrade header".into());
        }
    }
    Ok(())
}

fn header<'a>(headers: &'a HashMap<String, String>, wanted: &str) -> Option<&'a str> {
    headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(wanted))
        .map(|(_, value)| value.as_str())
}

fn header_token(headers: &HashMap<String, String>, name: &str, token: &str) -> bool {
    header(headers, name).is_some_and(|value| {
        value
            .split(',')
            .any(|part| part.trim().eq_ignore_ascii_case(token))
    })
}

#[cfg(test)]
#[path = "preview_upgrade_tests.rs"]
mod tests;
