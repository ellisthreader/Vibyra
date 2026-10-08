//! Runs the person's local MCP servers: one process per server, started on first
//! use, stopped when idle or on quit, restarted after a crash with capped
//! backoff. Calls to one server are serialised; different servers run in parallel.

use super::conn::Conn;
use super::env::parent_env;
use super::error::McpError;
use super::limits::Limits;
use super::slot::{Slot, State, Status};
use super::spec::ServerSpec;
use super::tools::{call_tool, list_tools, CallResult, ToolDef};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// Where secret values live (the operating-system credential store in the app).
pub trait SecretSource: Send + Sync {
    fn read(&self, server_id: &str, name: &str) -> Result<Option<String>, String>;
}

pub struct Supervisor {
    pub limits: Limits,
    pub(super) secrets: Arc<dyn SecretSource>,
    pub(super) slots: Mutex<HashMap<String, Arc<Slot>>>,
    pub(super) env: Box<dyn Fn() -> BTreeMap<String, String> + Send + Sync>,
}

impl Supervisor {
    pub fn new(limits: Limits, secrets: Arc<dyn SecretSource>) -> Arc<Self> {
        Self::with_env(limits, secrets, Box::new(parent_env))
    }

    /// The parent environment is a parameter so tests can prove what is inherited.
    pub fn with_env(
        limits: Limits,
        secrets: Arc<dyn SecretSource>,
        env: Box<dyn Fn() -> BTreeMap<String, String> + Send + Sync>,
    ) -> Arc<Self> {
        Arc::new(Self {
            limits,
            secrets,
            slots: Mutex::new(HashMap::new()),
            env,
        })
    }

    pub(super) fn slot(&self, id: &str) -> Arc<Slot> {
        let mut slots = self.slots.lock().unwrap_or_else(|p| p.into_inner());
        slots.entry(id.to_owned()).or_default().clone()
    }

    pub fn status(&self, id: &str) -> Status {
        self.slot(id).snapshot()
    }

    pub fn list_tools(&self, spec: &ServerSpec) -> Result<Vec<ToolDef>, McpError> {
        let timeout = self.limits.call_timeout(spec.timeout_secs);
        self.with_conn(spec, |conn| list_tools(conn, timeout))
    }

    pub fn call_tool(
        &self,
        spec: &ServerSpec,
        name: &str,
        arguments: &Value,
    ) -> Result<CallResult, McpError> {
        let timeout = self.limits.call_timeout(spec.timeout_secs);
        self.with_conn(spec, |conn| call_tool(conn, name, arguments, timeout))
    }

    /// Forget failures so the next use starts the server at once.
    pub fn retry(&self, id: &str) {
        let slot = self.slot(id);
        let mut run = slot.run.lock().unwrap_or_else(|p| p.into_inner());
        run.failures = 0;
        run.next_start = None;
        slot.set(|s| {
            s.failures = 0;
            if s.state == State::Failed {
                s.state = State::Stopped;
            }
        });
    }

    pub fn stop(&self, id: &str) {
        let slot = self.slot(id);
        slot.run
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .stop(&slot);
    }

    /// Quit: every server and everything it started.
    pub fn stop_all(&self) {
        let ids: Vec<String> = self
            .slots
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .keys()
            .cloned()
            .collect();
        for id in ids {
            self.stop(&id);
        }
    }

    pub(super) fn with_conn<T>(
        &self,
        spec: &ServerSpec,
        work: impl FnOnce(&mut Conn) -> Result<T, McpError>,
    ) -> Result<T, McpError> {
        if !spec.enabled {
            return Err(McpError::Disabled);
        }
        spec.validate()?;
        let slot = self.slot(&spec.id);
        let mut run = slot.run.lock().unwrap_or_else(|p| p.into_inner());
        self.ensure_started(spec, &slot, &mut run)?;
        let conn = run.conn.as_mut().ok_or(McpError::Disabled)?;
        match work(conn) {
            Ok(value) => {
                run.failures = 0;
                run.last_used = Some(Instant::now());
                slot.set(|s| s.failures = 0);
                Ok(value)
            }
            Err(error) => {
                // A call that went wrong in the server's transport leaves it in an unknown state: stop it.
                if matches!(
                    error,
                    McpError::Timeout(_)
                        | McpError::Crashed(_)
                        | McpError::TooLarge(_)
                        | McpError::Handshake(_)
                ) {
                    run.fail(&slot, &self.limits, error.to_string());
                } else {
                    run.last_used = Some(Instant::now());
                }
                Err(error)
            }
        }
    }
}

impl Drop for Supervisor {
    fn drop(&mut self) {
        self.stop_all();
    }
}
