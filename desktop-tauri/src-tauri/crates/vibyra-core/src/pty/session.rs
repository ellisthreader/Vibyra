use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::SyncSender;
use std::sync::Arc;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};

use crate::error::{CoreError, CoreResult};

use super::buffer::SessionOutput;
use super::input::InputQueue;
use super::{LaunchSpec, SessionId, Visibility};

/// A live PTY with its process, writer and shared output state.
pub struct Session {
    pub id: SessionId,
    pub agent_id: String,
    pub title: Mutex<String>,
    pub program: String,
    pub cwd: Option<String>,
    pub output: Mutex<SessionOutput>,
    pub alive: AtomicBool,
    pub exit_code: Mutex<Option<i32>>,
    /// The grid the program formats for, as `(cols, rows)`. `resize` pushed
    /// straight into `portable_pty` and recorded nothing, so nothing could
    /// answer "how wide is this terminal?" — and a phone that has to guess
    /// re-wraps every line and clamps a TUI's cursor moves into its last cell.
    size: Mutex<(u16, u16)>,
    input: InputQueue,
    master: Mutex<Box<dyn MasterPty + Send>>,
    pub(super) child: Mutex<Box<dyn Child + Send + Sync>>,
}

pub struct SessionOptions<'a> {
    pub id: SessionId,
    pub agent_id: &'a str,
    pub title: &'a str,
    pub pending_cap: usize,
    pub scrollback_cap: usize,
}

impl Session {
    /// Spawns `spec` inside a fresh PTY and starts the reader thread, which
    /// pushes raw bytes into the shared `SessionOutput` buffer. Delivery to
    /// the UI is done separately by the manager's flusher thread.
    pub fn spawn(
        options: SessionOptions<'_>,
        spec: &LaunchSpec,
        flush_tx: SyncSender<()>,
        on_exit: impl FnOnce(SessionId, Option<i32>) + Send + 'static,
    ) -> CoreResult<Arc<Self>> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: spec.rows,
                cols: spec.cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| CoreError::Pty(e.to_string()))?;

        let mut cmd = CommandBuilder::new(&spec.program);
        cmd.args(&spec.args);
        // A terminal must be the user's environment, not the bundle's. The
        // AppImage runtime points PYTHONHOME, LD_LIBRARY_PATH and a dozen
        // other search paths inside its own mount; inherited by a shell, that
        // is enough to break `python3` outright. Applied before the spec's own
        // entries so an explicit override still wins.
        let fix = crate::launch_env::appimage::current();
        for key in &fix.remove {
            cmd.env_remove(key);
        }
        for (key, value) in &fix.set {
            cmd.env(key, value);
        }
        for key in &spec.env_remove {
            cmd.env_remove(key);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        for (key, value) in &spec.env {
            cmd.env(key, value);
        }
        if let Some(cwd) = &spec.cwd {
            cmd.cwd(cwd);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| CoreError::Pty(e.to_string()))?;
        drop(pair.slave);

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| CoreError::Pty(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| CoreError::Pty(e.to_string()))?;

        let session = Arc::new(Self {
            id: options.id,
            agent_id: options.agent_id.to_string(),
            title: Mutex::new(options.title.to_string()),
            program: spec.program.clone(),
            cwd: spec.cwd.clone(),
            output: Mutex::new(SessionOutput::new(
                options.pending_cap,
                options.scrollback_cap,
            )),
            alive: AtomicBool::new(true),
            exit_code: Mutex::new(None),
            size: Mutex::new((spec.cols, spec.rows)),
            input: InputQueue::spawn(options.id, writer)?,
            master: Mutex::new(pair.master),
            child: Mutex::new(child),
        });
        super::reader::spawn(Arc::clone(&session), reader, flush_tx, on_exit)?;
        Ok(session)
    }

    /// Queues input for the program without waiting for it to be read.
    pub fn write_input(&self, data: &[u8]) -> CoreResult<()> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err(CoreError::SessionExited(self.id));
        }
        self.input.send(data)
    }

    pub fn resize(&self, rows: u16, cols: u16) -> CoreResult<()> {
        self.master
            .lock()
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| CoreError::Pty(e.to_string()))?;
        *self.size.lock() = (cols, rows);
        Ok(())
    }

    /// The grid this session is formatting for, as `(cols, rows)`.
    pub fn size(&self) -> (u16, u16) {
        *self.size.lock()
    }

    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    pub fn process_id(&self) -> Option<u32> {
        self.child.lock().process_id()
    }

    pub fn set_visibility(&self, visibility: Visibility) {
        self.output.lock().visibility = visibility;
    }
}
