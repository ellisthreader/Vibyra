use super::discovery;
use super::headers::{request_headers, request_url, response_headers};
use super::origin_rewrite::{browser_origin, rewritable, OriginRewriter};
use super::{PreviewService, RequestMetadata, Stream, MAX_RESPONSE_BODY};
use serde_json::json;
use std::sync::{atomic::Ordering, mpsc::SyncSender, Arc};
use std::time::Duration;
use vibyra_host::{PreviewFrame as Frame, StreamKey, MAX_CHUNK};

impl PreviewService {
    pub(super) fn forward_http(
        &self,
        device: String,
        key: StreamKey,
        stream: Arc<Stream>,
        metadata: RequestMetadata,
        body: Vec<u8>,
    ) {
        let sender = self.inner.subscribers.lock().get(&device).cloned();
        if let Some(sender) = sender {
            let result = tauri::async_runtime::block_on(
                self.fetch_http(&device, key, &stream, &sender, metadata, body),
            );
            if let Err(error) = result {
                #[cfg(test)]
                eprintln!("Preview HTTP fixture canceled: {error}");
                #[cfg(not(test))]
                let _ = error;
                self.mark_finished(&device, key);
                self.send_cancel(&sender, key);
            }
        }
        stream.canceled.store(true, Ordering::SeqCst);
        stream.wake.notify_all();
        self.inner.streams.lock().remove(&(device, key));
    }

    async fn fetch_http(
        &self,
        device: &str,
        key: StreamKey,
        stream: &Stream,
        sender: &SyncSender<Frame>,
        metadata: RequestMetadata,
        body: Vec<u8>,
    ) -> Result<(), String> {
        let binding = self.binding(device, key.generation())?;
        if binding
            .automatic
            .as_ref()
            .is_some_and(|server| !discovery::owns(server))
        {
            return Err("The running Preview site changed".into());
        }
        let phone_origin = if binding.attached_port.is_some() {
            Some(browser_origin(metadata.browser_origin.as_deref())?)
        } else {
            None
        };
        let url = request_url(&binding.origin, &metadata.path)?;
        let method = reqwest::Method::from_bytes(metadata.method.as_bytes())
            .map_err(|_| "Invalid Preview method")?;
        if !matches!(
            method,
            reqwest::Method::GET
                | reqwest::Method::HEAD
                | reqwest::Method::POST
                | reqwest::Method::PUT
                | reqwest::Method::PATCH
                | reqwest::Method::DELETE
                | reqwest::Method::OPTIONS
        ) {
            return Err("Preview method is not allowed".into());
        }
        let mut headers = request_headers(&metadata.headers, &binding.origin)?;
        if binding.attached_port.is_some() {
            headers.remove(reqwest::header::IF_NONE_MATCH);
            headers.remove(reqwest::header::IF_MODIFIED_SINCE);
        }
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .build()
            .map_err(|e| e.to_string())?;
        let mut response = client
            .request(method, url)
            .headers(headers)
            .body(body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if response
            .content_length()
            .is_some_and(|length| length > MAX_RESPONSE_BODY as u64)
        {
            return Err("Preview response exceeds proof limit".into());
        }
        let mut rewriter = if rewritable(response.headers().get(reqwest::header::CONTENT_TYPE)) {
            phone_origin.as_ref().map(|phone| {
                OriginRewriter::new(&binding.origin.origin().ascii_serialization(), phone)
            })
        } else {
            None
        };
        let (mut headers, set_cookies) = response_headers(response.headers(), &binding.origin);
        if rewriter.is_some() {
            headers.remove("etag");
            headers.remove("last-modified");
            headers.insert("cache-control".into(), "no-store".into());
        }
        let info = serde_json::to_vec(&json!({"v":1,"status":response.status().as_u16(),
            "headers":headers,"setCookies":set_cookies}))
        .map_err(|e| e.to_string())?;
        if info.len() > MAX_CHUNK {
            return Err("Preview response headers are too large".into());
        }
        self.queue_frame(device, stream, sender, key, Frame::Open { key })?;
        self.send_bytes(device, stream, sender, key, &info)?;
        let mut total = 0usize;
        let mut sent_total = 0usize;
        loop {
            let chunk =
                match tokio::time::timeout(Duration::from_millis(500), response.chunk()).await {
                    Ok(result) => result.map_err(|e| e.to_string())?,
                    Err(_) => {
                        if stream.canceled.load(Ordering::SeqCst) {
                            return Err("Preview canceled".into());
                        }
                        self.binding(device, key.generation())?;
                        continue;
                    }
                };
            let Some(chunk) = chunk else {
                break;
            };
            if stream.canceled.load(Ordering::SeqCst) {
                return Err("Preview canceled".into());
            }
            total = total
                .checked_add(chunk.len())
                .ok_or("Preview response too large")?;
            if total > MAX_RESPONSE_BODY {
                return Err("Preview response exceeds proof limit".into());
            }
            let bytes = if let Some(rewriter) = rewriter.as_mut() {
                rewriter.push(&chunk)
            } else {
                chunk.to_vec()
            };
            sent_total = sent_total
                .checked_add(bytes.len())
                .ok_or("Preview response too large")?;
            if sent_total > MAX_RESPONSE_BODY {
                return Err("Preview response exceeds proof limit".into());
            }
            self.send_bytes(device, stream, sender, key, &bytes)?;
        }
        if let Some(rewriter) = rewriter {
            let last = rewriter.finish();
            sent_total = sent_total
                .checked_add(last.len())
                .ok_or("Preview response too large")?;
            if sent_total > MAX_RESPONSE_BODY {
                return Err("Preview response exceeds proof limit".into());
            }
            self.send_bytes(device, stream, sender, key, &last)?;
        }
        self.binding(device, key.generation())?;
        self.mark_finished(device, key);
        let end = stream.outbound.lock().end().map_err(str::to_string)?;
        self.queue_frame(device, stream, sender, key, end)
    }
}
