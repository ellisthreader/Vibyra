use super::{PreviewService, RequestMetadata, Stream};
use std::sync::{atomic::Ordering, Arc};
use vibyra_host::StreamKey;

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
}
