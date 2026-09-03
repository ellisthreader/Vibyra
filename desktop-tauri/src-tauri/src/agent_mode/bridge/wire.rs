//! The line between the bridge process and the running app.
//!
//! One request, one reply, one TCP connection, both as a single JSON line.
//! The reply is shaped exactly as Claude wants its permission verdict, so the
//! bridge hands it on as text without rewriting it.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// What Claude asked, plus who is asking.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BridgeRequest {
    pub token: String,
    pub chat_id: String,
    pub turn_id: String,
    pub tool_name: String,
    pub input: Value,
}

/// The verdict, in Claude's own vocabulary: `allow` with the input it may run
/// with, or `deny` with the sentence it should read.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BridgeReply {
    pub behavior: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(rename = "updatedInput", skip_serializing_if = "Option::is_none")]
    pub updated_input: Option<Value>,
}

impl BridgeReply {
    pub fn allow(input: Value) -> Self {
        Self {
            behavior: "allow".into(),
            message: None,
            updated_input: Some(input),
        }
    }

    pub fn deny(message: impl Into<String>) -> Self {
        Self {
            behavior: "deny".into(),
            message: Some(message.into()),
            updated_input: None,
        }
    }
}

/// Something that can carry a request to the app and bring the reply back.
pub trait Wire {
    fn ask(&self, request: BridgeRequest) -> BridgeReply;
}

/// The bridge's coordinates, as Claude was told to pass them.
#[derive(Debug, Clone)]
pub struct Env {
    pub port: u16,
    pub token: String,
    pub chat_id: String,
    pub turn_id: String,
}

impl Env {
    pub fn from_process() -> Result<Self, String> {
        let read = |key: &str| {
            std::env::var(key).map_err(|_| format!("{key} is not set; Vibyra did not start this"))
        };
        Ok(Self {
            port: read("VIBYRA_BRIDGE_PORT")?
                .parse()
                .map_err(|_| "VIBYRA_BRIDGE_PORT is not a port".to_string())?,
            token: read("VIBYRA_BRIDGE_TOKEN")?,
            chat_id: read("VIBYRA_BRIDGE_CHAT")?,
            turn_id: read("VIBYRA_BRIDGE_TURN")?,
        })
    }
}

/// The real wire: one connection per question, to the app on localhost.
pub struct TcpWire {
    port: u16,
}

impl TcpWire {
    pub fn new(port: u16) -> Self {
        Self { port }
    }

    fn exchange(&self, request: &BridgeRequest) -> Result<BridgeReply, String> {
        let address = (std::net::Ipv4Addr::LOCALHOST, self.port).into();
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
            .map_err(|error| format!("could not reach Vibyra: {error}"))?;
        // A decision can sit for as long as a person takes; the app itself
        // gives up first, so this only guards against a vanished app.
        let _ = stream.set_read_timeout(Some(Duration::from_secs(45 * 60)));
        let mut line = serde_json::to_string(request).map_err(|e| e.to_string())?;
        line.push('\n');
        stream
            .write_all(line.as_bytes())
            .map_err(|error| format!("could not send to Vibyra: {error}"))?;
        let mut reply = String::new();
        BufReader::new(stream)
            .read_line(&mut reply)
            .map_err(|error| format!("Vibyra did not answer: {error}"))?;
        serde_json::from_str(reply.trim()).map_err(|error| format!("bad answer: {error}"))
    }
}

impl Wire for TcpWire {
    fn ask(&self, request: BridgeRequest) -> BridgeReply {
        match self.exchange(&request) {
            Ok(reply) => reply,
            Err(reason) => BridgeReply::deny(format!(
                "Vibyra could not decide this, so it was not allowed: {reason}"
            )),
        }
    }
}
