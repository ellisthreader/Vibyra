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
        let value = if (key == "location" || key == "x-inertia-location")
            && value.starts_with(origin.as_str())
        {
            &value[origin.as_str().len() - 1..]
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
mod tests {
    use super::{request_headers, request_url, response_headers};
    #[test]
    fn paths_cannot_choose_other_origins() {
        let base = reqwest::Url::parse("http://127.0.0.1:5151/").unwrap();
        assert!(request_url(&base, "/form?item=1").is_ok());
        for path in [
            "https://evil.invalid/",
            "//127.0.0.1:9999/",
            "/\\evil",
            "/a\nHost:evil",
        ] {
            assert!(request_url(&base, path).is_err());
        }
    }

    #[test]
    fn preserves_separate_session_and_csrf_cookies() {
        let base = reqwest::Url::parse("http://127.0.0.1:5151/").unwrap();
        let mut headers = reqwest::header::HeaderMap::new();
        headers.append(
            reqwest::header::SET_COOKIE,
            "session=one; HttpOnly".parse().unwrap(),
        );
        headers.append(
            reqwest::header::SET_COOKIE,
            "XSRF-TOKEN=two".parse().unwrap(),
        );
        let (ordinary, cookies) = response_headers(&headers, &base);
        assert!(!ordinary.contains_key("set-cookie"));
        assert_eq!(cookies, ["session=one; HttpOnly", "XSRF-TOKEN=two"]);
    }

    #[test]
    fn preserves_inertia_navigation_headers_without_forwarding_arbitrary_headers() {
        let base = reqwest::Url::parse("http://127.0.0.1:5151/").unwrap();
        let request = std::collections::HashMap::from([
            ("x-inertia".into(), "true".into()),
            ("x-inertia-partial-data".into(), "menu,cart".into()),
            ("x-unapproved".into(), "ignored".into()),
        ]);
        let forwarded = request_headers(&request, &base).unwrap();
        assert_eq!(forwarded["x-inertia"], "true");
        assert_eq!(forwarded["x-inertia-partial-data"], "menu,cart");
        assert!(!forwarded.contains_key("x-unapproved"));
        let mut response = reqwest::header::HeaderMap::new();
        response.insert("x-inertia", "true".parse().unwrap());
        response.insert("x-inertia-location", "/menu".parse().unwrap());
        let (returned, _) = response_headers(&response, &base);
        assert_eq!(returned["x-inertia"], "true");
        assert_eq!(returned["x-inertia-location"], "/menu");
    }
}
