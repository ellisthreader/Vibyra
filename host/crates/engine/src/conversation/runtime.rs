use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Arc},
    time::Duration,
};

#[derive(Debug)]
pub(crate) struct RpcError {
    pub unknown: bool,
    pub message: String,
}
impl RpcError {
    fn unknown(message: impl Into<String>) -> Self {
        Self {
            unknown: true,
            message: message.into(),
        }
    }
}
impl From<RpcError> for String {
    fn from(error: RpcError) -> Self {
        error.message
    }
}
type Replies = Arc<Mutex<HashMap<String, mpsc::SyncSender<Result<Value, RpcError>>>>>;
pub(crate) struct Runtime {
    input: Mutex<ChildStdin>,
    child: Mutex<Child>,
    replies: Replies,
}
impl Runtime {
    pub fn spawn(root: &Path, event: impl Fn(Value) + Send + 'static) -> Result<Arc<Self>, String> {
        let mut command = Command::new("codex");
        command
            .args(["app-server", "--listen", "stdio://"])
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        for key in [
            "OPENAI_API_KEY",
            "CODEX_API_KEY",
            "OPENROUTER_API_KEY",
            "ANTHROPIC_API_KEY",
            "CLAUDE_CODE_OAUTH_TOKEN",
        ] {
            command.env_remove(key);
        }
        Self::spawn_command(command, event)
    }
    pub(crate) fn spawn_command(
        mut command: Command,
        event: impl Fn(Value) + Send + 'static,
    ) -> Result<Arc<Self>, String> {
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut child = command
            .spawn()
            .map_err(|e| format!("Could not start Codex: {e}"))?;
        let output = child.stdout.take().ok_or("missing Codex output")?;
        let runtime = Arc::new(Self {
            input: Mutex::new(child.stdin.take().ok_or("missing Codex input")?),
            child: Mutex::new(child),
            replies: Arc::new(Mutex::new(HashMap::new())),
        });
        let replies = runtime.replies.clone();
        let events = super::batching::dispatch(event);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                // Provider output is untrusted and bounded before allocating a complete line.
                let mut line = Vec::new();
                let read = reader
                    .by_ref()
                    .take(1024 * 1024)
                    .read_until(b'\n', &mut line);
                if !matches!(read, Ok(n) if n > 0) || line.last() != Some(&b'\n') {
                    break;
                }
                let Ok(value) = serde_json::from_slice::<Value>(&line) else {
                    break;
                };
                if value.get("method").is_none() {
                    if let Some(id) = value["id"].as_str() {
                        if let Some(tx) = replies.lock().remove(id) {
                            let result = if value.get("error").is_some() {
                                Err(RpcError {
                                    unknown: false,
                                    message: value["error"]["message"]
                                        .as_str()
                                        .unwrap_or("Codex request failed")
                                        .to_owned(),
                                })
                            } else {
                                Ok(value["result"].clone())
                            };
                            let _ = tx.send(result);
                        }
                    }
                } else {
                    if events.send(value).is_err() {
                        break;
                    }
                }
            }
            for (_, tx) in replies.lock().drain() {
                let _ = tx.send(Err(RpcError::unknown("Codex connection ended")));
            }
            let _ = events.send(json!({"method":"vibyra/processExited"}));
        });
        runtime.request(
            "initialize",
            json!({"clientInfo":{"name":"vibyra_ios","version":"0.1.0"},
            "capabilities":{"experimentalApi":true}}),
        )?;
        runtime.write(json!({"method":"initialized"}))?;
        Ok(runtime)
    }
    pub fn request(&self, method: &str, params: Value) -> Result<Value, RpcError> {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = mpsc::sync_channel(1);
        self.replies.lock().insert(id.clone(), tx);
        if let Err(error) = self.write(json!({"id":id,"method":method,"params":params})) {
            self.replies.lock().remove(&id);
            return Err(RpcError::unknown(error));
        }
        let result = rx.recv_timeout(Duration::from_secs(25)).map_err(|_| {
            RpcError::unknown("Codex acknowledgement is unknown; do not repeat the action")
        });
        self.replies.lock().remove(&id);
        result?
    }
    pub fn write(&self, value: Value) -> Result<(), String> {
        let mut input = self.input.lock();
        serde_json::to_writer(&mut *input, &value).map_err(|e| e.to_string())?;
        input
            .write_all(b"\n")
            .and_then(|_| input.flush())
            .map_err(|e| e.to_string())
    }
    pub fn stop(&self) {
        let mut child = self.child.lock();
        #[cfg(unix)]
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGTERM);
        }
        let _ = child.kill();
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.stop();
        let _ = self.child.get_mut().wait();
    }
}
