use reqwest::header::{HeaderMap, HeaderName, HeaderValue};

pub(super) fn request_url(origin: &reqwest::Url, path: &str) -> Result<reqwest::Url, String> {
    if path.len() > 4096
        || !path.starts_with('/')
        || path.starts_with("//")
        || path.contains('\\')
        || path.chars().any(char::is_control)
    {
        return Err("Invalid Preview path".into());
    }
    let url = origin.join(path).map_err(|_| "Invalid Preview path")?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port() != origin.port()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("Preview path escaped its approved origin".into());
    }
    Ok(url)
}

pub(super) fn request_headers(
    source: &std::collections::HashMap<String, String>,
    origin: &reqwest::Url,
) -> Result<HeaderMap, String> {
    let mut result = HeaderMap::new();
    let mut total = 0usize;
    for (name, value) in source {
        total += name.len() + value.len();
        if total > 16 * 1024 {
            return Err("Preview request headers are too large".into());
        }
        let lower = name.to_ascii_lowercase();
        if !lower.starts_with("x-inertia-")
            && !matches!(
                lower.as_str(),
                "accept"
                    | "accept-language"
                    | "authorization"
                    | "content-type"
                    | "cookie"
                    | "if-modified-since"
                    | "if-none-match"
                    | "range"
                    | "user-agent"
                    | "x-csrf-token"
                    | "x-xsrf-token"
                    | "x-requested-with"
                    | "x-inertia"
                    | "origin"
            )
        {
            continue;
        }
        let value = if lower == "origin" {
            origin.origin().ascii_serialization()
        } else {
            value.clone()
        };
        let name =
            HeaderName::from_bytes(lower.as_bytes()).map_err(|_| "Invalid Preview header")?;
        let value = HeaderValue::from_str(&value).map_err(|_| "Invalid Preview header")?;
        result.insert(name, value);
    }
    Ok(result)
}

/// A redirect to the site's own address, under any loopback name it uses for
/// itself, becomes a path so the phone stays on its private origin.
fn site_path<'a>(value: &'a str, origin: &reqwest::Url) -> Option<&'a str> {
    let port = origin.port()?;
    ["127.0.0.1", "localhost", "[::1]"].iter().find_map(|host| {
        let rest = value.strip_prefix(&format!("http://{host}:{port}"))?;
        if rest.is_empty() {
            Some("/")
        } else {
            rest.starts_with(['/', '?']).then_some(rest)
        }
    })
}

pub(super) fn response_headers(
    source: &HeaderMap,
    origin: &reqwest::Url,
) -> (std::collections::HashMap<String, String>, Vec<String>) {
    let mut result = std::collections::HashMap::new();
    let mut total = 0usize;
    for (name, value) in source {
        let key = name.as_str();
        if !key.starts_with("x-inertia-")
            && !matches!(
                key,
                "content-type"
                    | "cache-control"
                    | "etag"
                    | "last-modified"
                    | "location"
                    | "content-range"
                    | "accept-ranges"
                    | "x-inertia"
            )
        {
            continue;
        }
        let Ok(value) = value.to_str() else {
            continue;
        };
        let value = if key == "location" || key == "x-inertia-location" {
            site_path(value, origin).unwrap_or(value)
        } else {
            value
        };
        total += key.len() + value.len();
        if total > 12 * 1024 {
            break;
        }
        result.insert(key.into(), value.into());
    }
    let mut set_cookies = Vec::new();
    for value in source.get_all(reqwest::header::SET_COOKIE) {
        let Ok(value) = value.to_str() else {
            continue;
        };
        total += value.len();
        if total > 12 * 1024 || set_cookies.len() >= 16 {
            break;
        }
        set_cookies.push(value.to_owned());
    }
    (result, set_cookies)
}

#[cfg(test)]
#[path = "headers_tests.rs"]
mod tests;
