//! A tiny loopback HTTP server for the Agent V2 tests: records every request
//! and answers from a handler. One request per connection.

use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

#[derive(Clone, Debug)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub runner_key: Option<String>,
    pub authorization: Option<String>,
    pub body: Value,
}

pub struct MockServer {
    pub base: String,
    pub requests: Arc<Mutex<Vec<Request>>>,
}

/// A raw reply: bytes and headers (attachment downloads, redirects).
/// `length: false` omits Content-Length and ends the body by closing.
pub struct Reply {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub length: bool,
}

type Handler = dyn Fn(&Request) -> Reply + Send + Sync;

impl MockServer {
    pub fn start(handler: impl Fn(&Request) -> (u16, String) + Send + Sync + 'static) -> Self {
        Self::start_raw(move |request| {
            let (status, body) = handler(request);
            Reply {
                status,
                headers: vec![("Content-Type".into(), "application/json".into())],
                body: body.into_bytes(),
                length: true,
            }
        })
    }

    pub fn start_raw(handler: impl Fn(&Request) -> Reply + Send + Sync + 'static) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let seen = requests.clone();
        let handler: Arc<Handler> = Arc::new(handler);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let Some(request) = read_request(&mut stream) else {
                    continue;
                };
                let reply = handler(&request);
                seen.lock().unwrap().push(request);
                let mut head = format!("HTTP/1.1 {} X\r\nConnection: close\r\n", reply.status);
                for (name, value) in &reply.headers {
                    head.push_str(&format!("{name}: {value}\r\n"));
                }
                if reply.length {
                    head.push_str(&format!("Content-Length: {}\r\n", reply.body.len()));
                }
                let _ = stream.write_all(format!("{head}\r\n").as_bytes());
                let _ = stream.write_all(&reply.body);
            }
        });
        Self { base, requests }
    }

    pub fn paths(&self) -> Vec<String> {
        self.requests
            .lock()
            .unwrap()
            .iter()
            .map(|r| format!("{} {}", r.method, r.path))
            .collect()
    }
}

fn read_request(stream: &mut std::net::TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut first = String::new();
    reader.read_line(&mut first).ok()?;
    let mut parts = first.split_whitespace();
    let method = parts.next()?.to_owned();
    let path = parts.next()?.to_owned();
    let (mut length, mut runner_key, mut authorization) = (0usize, None, None);
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).ok()?;
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        let (name, value) = line.split_once(':')?;
        let value = value.trim().to_owned();
        match name.to_ascii_lowercase().as_str() {
            "content-length" => length = value.parse().ok()?,
            "x-vibyra-runner-key" => runner_key = Some(value),
            "authorization" => authorization = Some(value),
            _ => {}
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some(Request {
        method,
        path,
        runner_key,
        authorization,
        body: serde_json::from_slice(&body).unwrap_or(Value::Null),
    })
}
