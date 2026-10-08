use vibyra_core::preview::{PreviewPhase, PreviewStatus};

pub(super) fn loopback_origin(status: &PreviewStatus) -> Result<reqwest::Url, String> {
    if status.phase != PreviewPhase::Running {
        return Err(format!(
            "Preview is not running on the {}",
            crate::window_preview::host_noun()
        ));
    }
    let url = reqwest::Url::parse(
        status
            .url
            .as_deref()
            .ok_or("Preview has no local address")?,
    )
    .map_err(|_| "Invalid local Preview address")?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("Preview did not bind to approved loopback".into());
    }
    Ok(url)
}
