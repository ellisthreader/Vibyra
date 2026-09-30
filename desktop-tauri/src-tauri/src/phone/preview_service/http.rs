use super::client::client;
use super::discovery;
use super::headers::{request_headers, request_url, response_headers};
use super::origin_rewrite::{browser_origin, rewritable, OriginRewriter};
use super::{PreviewService, RequestMetadata, Stream, MAX_RESPONSE_BODY};
use serde_json::json;
use std::sync::{atomic::Ordering, mpsc::SyncSender};
use std::time::Duration;
use vibyra_host::{PreviewFrame as Frame, StreamKey, MAX_CHUNK};

impl PreviewService {
    pub(super) async fn fetch_http(
        &self,
        device: &str,
        key: StreamKey,
        stream: &Stream,
        sender: &SyncSender<Frame>,
        metadata: RequestMetadata,
        body: Vec<u8>,
    ) -> Result<(), String> {
        stream.require_remote("preview:access")?;
        let binding = self.binding(device, key.generation())?;
        if let Some(window) = &binding.window {
            return self.window_http(device, key, stream, sender, window, metadata, body);
        }
        if binding
            .automatic
            .as_ref()
            .is_some_and(|server| !discovery::owns(server))
        {
            return Err("The running Preview site changed".into());
        }
        let phone_origin = if binding.attached_port.is_some() || metadata.browser_origin.is_some() {
            Some(browser_origin(metadata.browser_origin.as_deref())?)
        } else {
            None
        };
        let mut ports = vec![binding.origin.port().unwrap_or(80)];
        ports.extend(self.companion_port(&binding));
        let request_binding = self.request_binding(&binding, &metadata.path)?;
        let url = request_url(&request_binding.origin, &metadata.path)?;
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
        let mut headers = request_headers(&metadata.headers, &request_binding.origin)?;
        if phone_origin.is_some() {
            headers.remove(reqwest::header::IF_NONE_MATCH);
            headers.remove(reqwest::header::IF_MODIFIED_SINCE);
        }
        let head = method == reqwest::Method::HEAD;
        let mut response = client()?
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
            phone_origin
                .as_ref()
                .map(|phone| OriginRewriter::ports(&ports, phone))
        } else {
            None
        };
        let (mut headers, set_cookies) =
            response_headers(response.headers(), &request_binding.origin);
        let mut gzip = super::compress::wanted(
            &metadata.headers,
            response.headers().get(reqwest::header::CONTENT_TYPE),
            response.status().as_u16(),
            response
                .headers()
                .contains_key(reqwest::header::CONTENT_RANGE),
            head,
        )
        .then(super::compress::Gzip::new);
        if gzip.is_some() {
            headers.insert("content-encoding".into(), "gzip".into());
            headers.insert("vary".into(), "accept-encoding".into());
        }
        if rewriter.is_some() {
            headers.remove("etag");
            headers.remove("last-modified");
            // A rewritten script or stylesheet names the phone's loopback origin,
            // which lasts as long as the Preview browser and its private store,
            // so it may keep the site's own caching: a reload then fetches only
            // the page. The page itself is always fetched fresh.
            let html = headers
                .get("content-type")
                .is_some_and(|kind| kind.to_ascii_lowercase().contains("html"));
            if html {
                headers.insert("cache-control".into(), "no-store".into());
            }
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
            let bytes = match gzip.as_mut() {
                Some(gzip) => gzip.push(&bytes)?,
                None => bytes,
            };
            sent_total = sent_total
                .checked_add(bytes.len())
                .ok_or("Preview response too large")?;
            if sent_total > MAX_RESPONSE_BODY {
                return Err("Preview response exceeds proof limit".into());
            }
            self.send_bytes(device, stream, sender, key, &bytes)?;
        }
        let mut last = rewriter
            .map(|rewriter| rewriter.finish())
            .unwrap_or_default();
        if let Some(mut gzip) = gzip {
            last = gzip.push(&last)?;
            last.extend(gzip.finish()?);
        }
        sent_total = sent_total
            .checked_add(last.len())
            .ok_or("Preview response too large")?;
        if sent_total > MAX_RESPONSE_BODY {
            return Err("Preview response exceeds proof limit".into());
        }
        self.send_bytes(device, stream, sender, key, &last)?;
        self.binding(device, key.generation())?;
        self.mark_finished(device, key);
        let end = stream.outbound.lock().end().map_err(str::to_string)?;
        self.queue_frame(device, stream, sender, key, end)
    }
}
