use super::{api::trusted_authorization, tools};

#[test]
fn browser_authorization_is_provider_and_path_bound() {
    assert!(trusted_authorization(
        "gmail",
        "https://accounts.google.com/o/oauth2/v2/auth?state=x",
        None
    ));
    for url in [
        "http://accounts.google.com/o/oauth2/v2/auth",
        "https://accounts.google.com.evil.test/o/oauth2/v2/auth",
        "https://accounts.google.com@evil.test/o/oauth2/v2/auth",
        "https://accounts.google.com/redirect",
        "https://accounts.google.com:9443/o/oauth2/v2/auth",
        "https://accounts.google.com/o/oauth2/v2/auth#x",
    ] {
        assert!(!trusted_authorization("gmail", url, None));
    }
    assert!(trusted_authorization(
        "shopify",
        "https://my-shop.myshopify.com/admin/oauth/authorize",
        Some("my-shop.myshopify.com")
    ));
    assert!(!trusted_authorization(
        "shopify",
        "https://other.myshopify.com/admin/oauth/authorize",
        Some("my-shop.myshopify.com")
    ));
    assert!(!trusted_authorization(
        "shopify",
        "https://evil.test/admin/oauth/authorize",
        Some("evil.test")
    ));
}

#[test]
fn engines_share_only_bounded_read_tools() {
    let dynamic = crate::agent_mode::bridge::proposal_tools::dynamic();
    for tool in tools::tools() {
        assert!(dynamic
            .iter()
            .any(|t| t["name"] == tool["name"] && t["inputSchema"] == tool["inputSchema"]));
    }
    assert!(!tools::is_tool("integration_grant"));
    assert!(!tools::is_tool("integration_connect"));
    assert!(!tools::is_tool("integration_write"));
}
