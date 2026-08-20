use std::io;
use std::net::{TcpListener, TcpStream};
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
        listener.set_nonblocking(true)?;
        let port = listener.local_addr()?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let active = Arc::new(AtomicUsize::new(0));
        let join = thread::spawn(move || {
            while !thread_stop.load(Ordering::Relaxed) {
                match listener.accept() {
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
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(Self {
            stop,
            join: Some(join),
            port,
        })
    }

    pub fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = TcpStream::connect(("127.0.0.1", self.port));
        if let Some(join) = self.join.take() {
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
