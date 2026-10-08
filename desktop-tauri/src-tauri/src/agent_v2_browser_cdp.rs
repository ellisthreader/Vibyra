//! A small Chrome DevTools Protocol client (flattened sessions) over Chrome's
//! `--remote-debugging-pipe` descriptors: NUL-terminated JSON messages, no
//! socket. A reader thread routes responses to waiting callers and hands
//! every event to a policy handler that can answer at once (Fetch decisions,
//! auto-attached targets); a writer thread owns Chrome's input so neither
//! side can block the other.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

type Reply = Sender<Result<Value, String>>;
/// Event handler: `(event, send)`; `send(method, params, session)` fires a command.
pub type Handler = Box<dyn FnMut(&Value, &mut dyn FnMut(&str, Value, Option<&str>)) + Send>;

pub struct Cdp {
    out: Sender<String>,
    next: Arc<AtomicU64>,
    pending: Arc<Mutex<HashMap<u64, Reply>>>,
    alive: Arc<AtomicBool>,
}

impl Cdp {
    /// `reader` is what Chrome writes (its fd 4), `writer` what it reads (fd 3).
    pub fn connect(
        reader: impl Read + Send + 'static,
        writer: impl Write + Send + 'static,
        mut handler: Handler,
    ) -> Cdp {
        let (tx, rx) = channel::<String>();
        let next = Arc::new(AtomicU64::new(1));
        let pending: Arc<Mutex<HashMap<u64, Reply>>> = Arc::default();
        let alive = Arc::new(AtomicBool::new(true));
        let (flag, mut writer) = (alive.clone(), writer);
        std::thread::spawn(move || {
            for text in rx {
                let sent = writer
                    .write_all(text.as_bytes())
                    .and_then(|_| writer.write_all(&[0]))
                    .and_then(|_| writer.flush());
                if sent.is_err() {
                    break;
                }
            }
            flag.store(false, Ordering::SeqCst);
        });
        let (ids, waiting, flag, events) =
            (next.clone(), pending.clone(), alive.clone(), tx.clone());
        std::thread::spawn(move || {
            pump(reader, &events, &ids, &waiting, &mut handler);
            flag.store(false, Ordering::SeqCst);
            for (_, reply) in waiting.lock().unwrap().drain() {
                let _ = reply.send(Err("The browser closed.".into()));
            }
        });
        Cdp {
            out: tx,
            next,
            pending,
            alive,
        }
    }

    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    pub fn call(
        &self,
        method: &str,
        params: Value,
        session: Option<&str>,
    ) -> Result<Value, String> {
        self.call_for(method, params, session, Duration::from_secs(20))
    }

    pub fn call_for(
        &self,
        method: &str,
        params: Value,
        session: Option<&str>,
        wait: Duration,
    ) -> Result<Value, String> {
        if !self.alive() {
            return Err("The browser closed.".into());
        }
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        let (reply, answer) = channel();
        self.pending.lock().unwrap().insert(id, reply);
        let _ = self.out.send(frame(id, method, params, session));
        let result = answer
            .recv_timeout(wait)
            .map_err(|_| format!("The browser did not answer {method}."));
        self.pending.lock().unwrap().remove(&id);
        result?
    }
}

fn frame(id: u64, method: &str, params: Value, session: Option<&str>) -> String {
    let mut body = json!({"id": id, "method": method, "params": params});
    if let Some(session) = session {
        body["sessionId"] = json!(session);
    }
    body.to_string()
}

fn pump(
    reader: impl Read,
    out: &Sender<String>,
    ids: &AtomicU64,
    pending: &Mutex<HashMap<u64, Reply>>,
    handler: &mut Handler,
) {
    let mut reader = BufReader::new(reader);
    let mut message = Vec::new();
    loop {
        message.clear();
        match reader.read_until(0, &mut message) {
            Ok(0) | Err(_) => return,
            Ok(_) => {}
        }
        if message.last() == Some(&0) {
            message.pop();
        }
        let Ok(value) = serde_json::from_slice::<Value>(&message) else {
            continue;
        };
        if let Some(id) = value["id"].as_u64() {
            if let Some(reply) = pending.lock().unwrap().remove(&id) {
                let result = match value.get("error") {
                    Some(error) => Err(error["message"]
                        .as_str()
                        .unwrap_or("browser error")
                        .to_owned()),
                    None => Ok(value["result"].clone()),
                };
                let _ = reply.send(result);
            }
            continue;
        }
        let mut queued: Vec<String> = Vec::new();
        handler(&value, &mut |method, params, session| {
            queued.push(frame(
                ids.fetch_add(1, Ordering::SeqCst),
                method,
                params,
                session,
            ));
        });
        for text in queued {
            if out.send(text).is_err() {
                return;
            }
        }
    }
}
