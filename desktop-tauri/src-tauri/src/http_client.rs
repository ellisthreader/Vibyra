//! One HTTP client for the app's plain requests.
//!
//! A `reqwest::Client` owns a connection pool. Building one per request threw
//! the pool away every time, so every account, teammate and OpenAI call paid
//! DNS, TCP and a TLS handshake again. Timeouts stay on each request, where
//! they always were; a caller that needs a different client configuration
//! (the chat stream's read timeout) keeps its own, built once as well.

use std::sync::LazyLock;

static SHARED: LazyLock<reqwest::Client> = LazyLock::new(reqwest::Client::new);

pub fn shared() -> &'static reqwest::Client {
    &SHARED
}
