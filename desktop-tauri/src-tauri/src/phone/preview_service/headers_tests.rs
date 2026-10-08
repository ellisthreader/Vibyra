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
    response.insert(
        "location",
        "http://localhost:5151/login?next=1".parse().unwrap(),
    );
    let (returned, _) = response_headers(&response, &base);
    assert_eq!(returned["x-inertia"], "true");
    assert_eq!(returned["x-inertia-location"], "/menu");
    assert_eq!(returned["location"], "/login?next=1");
}

#[test]
fn redirects_to_the_site_under_any_loopback_name_become_paths() {
    let base = reqwest::Url::parse("http://127.0.0.1:5151/").unwrap();
    for (location, expected) in [
        ("http://127.0.0.1:5151", "/"),
        ("http://127.0.0.1:5151/menu", "/menu"),
        ("http://[::1]:5151/?a=1", "/?a=1"),
        ("http://127.0.0.1:51510/menu", "http://127.0.0.1:51510/menu"),
        ("https://example.com/", "https://example.com/"),
    ] {
        let mut response = reqwest::header::HeaderMap::new();
        response.insert("location", location.parse().unwrap());
        assert_eq!(response_headers(&response, &base).0["location"], expected);
    }
}
