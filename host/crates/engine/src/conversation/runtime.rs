use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::Write,
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::Duration,
};

#[derive(Debug)]
pub(crate) struct RpcError {
    pub unknown: bool,
    pub message: String,
}
impl RpcError {
    pub(super) fn unknown(message: impl Into<String>) -> Self {
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
pub(super) type Replies = Arc<Mutex<HashMap<String, mpsc::SyncSender<Result<Value, RpcError>>>>>;
pub(crate) struct Runtime {
    input: Mutex<ChildStdin>,
    child: Mutex<Child>,
    replies: Replies,
    pub(super) bridge: Arc<Mutex<Option<Arc<super::terminal_bridge::Bridge>>>>,
    initialized: Mutex<Value>,
    pub(super) started: Mutex<Value>,
    closed: Arc<AtomicBool>,
}
impl Runtime {
    pub fn spawn(
        root: &Path,
        launch: &crate::embedded::ConversationLaunch,
        event: impl Fn(Value) + Send + 'static,
    ) -> Result<Arc<Self>, String> {
        let mut command = Command::new(&launch.program);
        command
            .args(["app-server", "--listen", "stdio://"])
            .current_dir(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        command.envs(launch.environment.iter().cloned());
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
            bridge: Arc::new(Mutex::new(None)),
            initialized: Mutex::new(Value::Null),
            started: Mutex::new(Value::Null),
            closed: Arc::new(AtomicBool::new(false)),
        });
        super::runtime_output::start(
            output,
            runtime.replies.clone(),
            runtime.bridge.clone(),
            runtime.closed.clone(),
            event,
        );
        let initialized = runtime.request(
            "initialize",
            json!({"clientInfo":{"name":"vibyra_ios","version":"0.1.0"},
            "capabilities":{"experimentalApi":true}}),
        )?;
        *runtime.initialized.lock() = initialized;
        runtime.write(json!({"method":"initialized"}))?;
        Ok(runtime)
    }
    pub fn request(&self, method: &str, params: Value) -> Result<Value, RpcError> {
        self.request_timeout(method, params, Duration::from_secs(25))
    }
    fn request_timeout(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
    ) -> Result<Value, RpcError> {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = mpsc::sync_channel(1);
        self.replies.lock().insert(id.clone(), tx);
        if let Err(error) = self.write(json!({"id":id,"method":method,"params":params})) {
            self.replies.lock().remove(&id);
            return Err(RpcError::unknown(error));
        }
        let result = rx.recv_timeout(timeout).map_err(|_| {
            RpcError::unknown("Codex acknowledgement is unknown; do not repeat the action")
        });
        self.replies.lock().remove(&id);
        result?
    }
    pub fn write(&self, value: Value) -> Result<(), String> {
        if let Some(bridge) = self.bridge.lock().as_ref() {
            bridge.claim_response(&value)?;
        }
        let mut input = self.input.lock();
        serde_json::to_writer(&mut *input, &value).map_err(|e| e.to_string())?;
        input
            .write_all(b"\n")
            .and_then(|_| input.flush())
            .map_err(|e| e.to_string())
    }
    pub fn exited(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }
    pub fn attach(
        self: &Arc<Self>,
        thread: String,
        before: Arc<super::terminal_bridge::BeforeRequest>,
    ) -> Result<String, String> {
        if self.exited() {
            return Err("Codex has stopped; its saved chat is still available".into());
        }
        let mut bridge = self.bridge.lock();
        if let Some(bridge) = bridge.as_ref() {
            return Ok(bridge.endpoint.clone());
        }
        #[cfg(unix)]
        {
            let attachment = super::terminal_socket::start(
                self,
                thread,
                self.initialized.lock().clone(),
                before,
            )?;
            let endpoint = attachment.endpoint.clone();
            *bridge = Some(attachment);
            Ok(endpoint)
        }
        #[cfg(not(unix))]
        {
            let _ = (thread, before, &mut bridge);
            Err("Native shared Codex terminals currently require macOS or Linux. Use Chat view on this computer.".into())
        }
    }
    pub fn stop_thread(&self, thread: &str) {
        if !self.exited() {
            // Let Codex release its persistent writer lease before terminating.
            let _ = self.request_timeout(
                "thread/unsubscribe",
                json!({"threadId":thread}),
                Duration::from_secs(2),
            );
        }
        self.stop();
    }
    pub fn stop(&self) {
        self.closed.store(true, Ordering::Release);
        self.bridge.lock().take();
        let mut child = self.child.lock();
        #[cfg(unix)]
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGTERM);
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.stop();
        let _ = self.child.get_mut().wait();
    }
}
