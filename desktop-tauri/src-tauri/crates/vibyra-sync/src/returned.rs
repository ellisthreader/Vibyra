//! Conversations Vibyra Cloud continued and sent back (`kind=transcripts` on the down path). Each one is
//! remembered per project with when the cloud last added to it, so the app can say "N conversations
//! continued in Vibyra Cloud", mark a terminal that owns one, and offer to continue one on this Mac.
use crate::transcripts::SessionMeta;
use serde::{Deserialize, Serialize};

/// Older entries beyond this many (oldest cloud append first) are forgotten.
pub const MAX_RETURNED: usize = 30;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReturnedSession {
    /// `claude` or `codex`.
    pub provider: String,
    /// The provider's conversation id (a UUID): `claude --resume <id>` / `codex resume <id>`.
    pub id: String,
    /// Unix seconds of the cloud's last append (the manifest's `cloudAt`, else the file's mtime).
    pub cloud_at: u64,
}

fn uuid_like(id: &str) -> bool {
    id.len() == 36 && id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-')
}

/// The conversation a returned session names, if it is one this Mac can resume. A session without `ranIn`
/// still counts: the down path only ever carries what the cloud sent.
pub fn from_meta(meta: &SessionMeta) -> Option<ReturnedSession> {
    if meta.ran_in.as_deref().is_some_and(|r| r != "cloud") {
        return None;
    }
    let id = match meta.provider.as_str() {
        "claude" => meta.id.as_str(),
        "codex" => meta.id.get(meta.id.len().saturating_sub(36)..)?,
        _ => return None,
    };
    uuid_like(id).then(|| ReturnedSession {
        provider: meta.provider.clone(),
        id: id.to_ascii_lowercase(),
        cloud_at: meta.cloud_at.unwrap_or(meta.mtime),
    })
}

/// Adds (or refreshes) the sessions just written, newest kept.
pub fn record(list: &mut Vec<ReturnedSession>, written: &[SessionMeta]) {
    for session in written.iter().filter_map(from_meta) {
        match list
            .iter_mut()
            .find(|s| s.provider == session.provider && s.id == session.id)
        {
            Some(known) => known.cloud_at = known.cloud_at.max(session.cloud_at),
            None => list.push(session),
        }
    }
    list.sort_by_key(|entry| std::cmp::Reverse(entry.cloud_at));
    list.truncate(MAX_RETURNED);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(provider: &str, id: &str, ran_in: Option<&str>, cloud_at: Option<u64>) -> SessionMeta {
        SessionMeta {
            provider: provider.into(),
            id: id.into(),
            file: String::new(),
            cwd: String::new(),
            mtime: 100,
            ran_in: ran_in.map(Into::into),
            cloud_at,
        }
    }

    const ID: &str = "11111111-2222-3333-4444-555555555555";

    #[test]
    fn records_cloud_sessions_newest_first_and_refreshes_known_ones() {
        let mut list = vec![];
        let codex = format!("rollout-2026-10-04T10-00-00-{ID}");
        record(
            &mut list,
            &[
                meta("claude", ID, None, None),
                meta("codex", &codex, Some("cloud"), Some(300)),
                meta("claude", "not-a-uuid", None, None),
                meta("claude", ID, Some("mac"), Some(900)),
            ],
        );
        assert_eq!(list.len(), 2);
        assert_eq!(
            (
                list[0].provider.as_str(),
                list[0].id.as_str(),
                list[0].cloud_at
            ),
            ("codex", ID, 300)
        );
        assert_eq!(list[1].cloud_at, 100);
        record(&mut list, &[meta("claude", ID, Some("cloud"), Some(500))]);
        assert_eq!(
            (list.len(), list[0].provider.as_str(), list[0].cloud_at),
            (2, "claude", 500)
        );
    }
}
