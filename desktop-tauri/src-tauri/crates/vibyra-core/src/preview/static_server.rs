use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::CoreResult;

use super::static_connection::serve;

const MAX_ACTIVE_CONNECTIONS: usize = 32;

pub(crate) struct StaticServer {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
    pub port: u16,
}

impl StaticServer {
    pub fn start(root: PathBuf, entry: PathBuf) -> CoreResult<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let active = Arc::new(AtomicUsize::new(0));
        // A blocking accept sleeps until a request arrives instead of waking
        // 50 times a second; `stop` connects once to wake it.
        let join = thread::spawn(move || loop {
            let accepted = listener.accept();
            if thread_stop.load(Ordering::Acquire) {
                break;
            }
            match accepted {
                Ok((stream, _)) if reserve_connection(&active) => {
                    let root = root.clone();
                    let entry = entry.clone();
                    let active = Arc::clone(&active);
                    thread::spawn(move || {
                        let _guard = ActiveConnection(active);
                        let _ = serve(stream, &root, &entry);
                    });
                }
                Ok((stream, _)) => drop(stream),
                Err(_) => break,
            }
        });
        Ok(Self {
            stop,
            join: Some(join),
            port,
        })
    }

    pub fn stop(&mut self) {
        let Some(join) = self.join.take() else {
            return;
        };
        self.stop.store(true, Ordering::Release);
        let address = SocketAddr::from(([127, 0, 0, 1], self.port));
        // Joining is only safe once the wake-up connection has landed. If it
        // could not, the thread exits on the next connection it accepts.
        if TcpStream::connect_timeout(&address, Duration::from_secs(1)).is_ok() {
            let _ = join.join();
        }
    }
}

impl Drop for StaticServer {
    fn drop(&mut self) {
        self.stop();
    }
}

fn reserve_connection(active: &AtomicUsize) -> bool {
    active
        .fetch_update(Ordering::AcqRel, Ordering::Relaxed, |count| {
            (count < MAX_ACTIVE_CONNECTIONS).then_some(count + 1)
        })
        .is_ok()
}

struct ActiveConnection(Arc<AtomicUsize>);

impl Drop for ActiveConnection {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::Release);
    }
}
