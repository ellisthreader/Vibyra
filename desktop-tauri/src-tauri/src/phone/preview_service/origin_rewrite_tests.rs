use super::{browser_origin, OriginRewriter};

fn rewrite(chunks: &[&str]) -> String {
    let mut rewrite = OriginRewriter::new(8001, "http://127.0.0.1:55331");
    let mut output = Vec::new();
    for chunk in chunks {
        output.extend(rewrite.push(chunk.as_bytes()));
    }
    output.extend(rewrite.finish());
    String::from_utf8(output).unwrap()
}

#[test]
fn rewrites_escaped_and_aliased_site_addresses() {
    assert_eq!(
        rewrite(&[r#"{"url":"http:\/\/127.0.0.1:8001","img":"http:\/\/127.0.0.1:8001\/a.png"}"#]),
        r#"{"url":"http:\/\/127.0.0.1:55331","img":"http:\/\/127.0.0.1:55331\/a.png"}"#
    );
    assert_eq!(
        rewrite(&[
            "<a href=\"http://localhost:8001/login\"> ws://[::1]:8001/hmr //127.0.0.1:8001/x"
        ]),
        "<a href=\"http://127.0.0.1:55331/login\"> ws://127.0.0.1:55331/hmr //127.0.0.1:55331/x"
    );
    // Split inside the host, inside the port, and just before the boundary byte.
    assert_eq!(
        rewrite(&[
            "src=\"http://local",
            "host:80",
            "01",
            "/a\" x=localhost:8001"
        ]),
        "src=\"http://127.0.0.1:55331/a\" x=127.0.0.1:55331"
    );
}

#[test]
fn leaves_other_ports_and_hosts_alone() {
    assert_eq!(
        rewrite(&["127.0.0.1:80011 10.127.0.0.1:8001 mylocalhost:8001 localhost:9000"]),
        "127.0.0.1:80011 10.127.0.0.1:8001 mylocalhost:8001 localhost:9000"
    );
    assert_eq!(rewrite(&["127.0.0.1:800", "1", "1"]), "127.0.0.1:80011");
}

#[test]
fn rewrites_split_absolute_urls_without_touching_other_origins() {
    let mut rewrite = OriginRewriter::new(8001, "http://127.0.0.1:55331");
    let mut output = rewrite.push(b"<img src=\"http://127.0.0.");
    output.extend(rewrite.push(b"1:8001/menu\"> http://127.0.0.1:9000"));
    output.extend(rewrite.finish());
    assert_eq!(
        String::from_utf8(output).unwrap(),
        "<img src=\"http://127.0.0.1:55331/menu\"> http://127.0.0.1:9000"
    );
}

#[test]
fn accepts_only_exact_phone_loopback_origin() {
    assert_eq!(
        browser_origin(Some("http://127.0.0.1:55331")).unwrap(),
        "http://127.0.0.1:55331"
    );
    for invalid in [
        None,
        Some("http://localhost:55331"),
        Some("http://127.0.0.1:55331/path"),
        Some("https://127.0.0.1:55331"),
        Some("http://127.0.0.1:55331@other.invalid"),
    ] {
        assert!(browser_origin(invalid).is_err());
    }
}
