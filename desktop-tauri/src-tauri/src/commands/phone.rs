fn resource_url(resource: &str) -> Result<&'static str, String> {
    match resource {
        "app" => Ok("https://vibyra.expo.app"),
        "downloads" => {
            Ok("https://github.com/ellisthreader/Vibyra/releases/tag/v0.6.0-host-preview")
        }
        "guide" => Ok("https://github.com/ellisthreader/Vibyra/blob/release/0.6.0/host/README.md"),
        _ => Err("Unknown phone companion page.".to_owned()),
    }
}

#[tauri::command]
pub async fn phone_open_resource(resource: String) -> Result<(), String> {
    let url = resource_url(&resource)?;
    super::run_blocking(move || crate::provider_auth_url::open(url)).await
}

#[cfg(test)]
mod tests {
    use super::resource_url;

    #[test]
    fn opens_only_named_phone_resources() {
        for resource in ["app", "downloads", "guide"] {
            assert!(resource_url(resource).unwrap().starts_with("https://"));
        }
        for resource in ["https://example.com", "file:///tmp/test", "", "app;whoami"] {
            assert!(resource_url(resource).is_err());
        }
    }
}
