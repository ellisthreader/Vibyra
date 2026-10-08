pub(super) fn select(method: Option<&str>, has_body: bool) -> reqwest::Method {
    match method {
        Some("PATCH") => reqwest::Method::PATCH,
        Some("PUT") => reqwest::Method::PUT,
        Some("DELETE") => reqwest::Method::DELETE,
        _ if has_body => reqwest::Method::POST,
        _ => reqwest::Method::GET,
    }
}
