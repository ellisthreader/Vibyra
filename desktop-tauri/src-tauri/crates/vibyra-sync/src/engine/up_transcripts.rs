//! Conversations (`kind=transcripts`) after the code upload: pack, skip if unchanged, seal, upload.
use super::upload::Prepared;
use super::{now, Engine, ProjectRef, SyncOptions};
use crate::client::Project;
use crate::crypto::hex;
use crate::error::Result;
use crate::state::ProjectState;
use sha2::{Digest, Sha256};

/// Conversations go up whole (every session, up to 50 MiB each), and a live one changes every few seconds: resending
/// on each change sent ~90 MB every two minutes. Send at most this often unless forced or the cloud lost its copy.
pub const TRANSCRIPTS_GAP_SECS: u64 = 600;

/// Whether conversations may be packed and sent now: the first time, on a forced resync, when the cloud's copy is not
/// the one this Mac last sent, or once `TRANSCRIPTS_GAP_SECS` have passed since the last upload.
pub(super) fn transcripts_due(st: &ProjectState, cloud_seq: u64, resync: bool, at: u64) -> bool {
    resync
        || st.transcripts_seq == 0
        || cloud_seq != st.transcripts_seq
        || st
            .transcripts_at
            .is_none_or(|sent| at.saturating_sub(sent) >= TRANSCRIPTS_GAP_SECS)
}

impl Engine {
    pub(super) fn upload_transcripts(
        &self,
        key: &str,
        project: &ProjectRef,
        opts: &SyncOptions,
        st: &mut ProjectState,
        cloud: Project,
        vm_key: &[u8; 32],
    ) -> Result<Option<u64>> {
        let Some(home) = opts.home.clone().or_else(dirs::home_dir) else {
            return Ok(None);
        };
        if !transcripts_due(st, cloud.transcripts_seq, opts.resync, now()) {
            return Ok(None);
        }
        let tar = self.tmp(key)?.join("transcripts.tar");
        let sessions = crate::transcripts::pack(&st.name, &project.root, &home, &tar)?;
        if sessions.is_empty() {
            let _ = std::fs::remove_file(&tar);
            return Ok(None);
        }
        let sha = hex(&Sha256::digest(std::fs::read(&tar)?));
        if st.transcripts_sha.as_deref() == Some(sha.as_str())
            && cloud.transcripts_seq == st.transcripts_seq
            && !opts.resync
        {
            let _ = std::fs::remove_file(&tar);
            return Ok(None);
        }
        let up = self.upload(
            key,
            &st.name.clone(),
            "transcripts",
            cloud,
            vm_key,
            &|_, _| {
                Ok(Prepared {
                    plain: tar.clone(),
                    base_seq: 0,
                    head: None,
                })
            },
        );
        let _ = std::fs::remove_file(&tar);
        let up = match up {
            Ok(up) => up,
            // The code is already safe in the cloud: a conversation failure is remembered, not fatal.
            Err(e) => {
                st.last_error = Some(format!("Conversations were not uploaded: {e}"));
                return Ok(None);
            }
        };
        st.transcripts_seq = up.seq;
        st.transcripts_sha = Some(sha);
        st.transcripts_at = Some(now());
        Ok(Some(up.seq))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sent(seq: u64, at: Option<u64>) -> ProjectState {
        ProjectState {
            transcripts_seq: seq,
            transcripts_at: at,
            ..Default::default()
        }
    }

    #[test]
    fn conversations_go_up_at_most_every_ten_minutes() {
        let t = 1_000_000;
        assert!(transcripts_due(&sent(0, None), 0, false, t), "first upload");
        assert!(
            !transcripts_due(&sent(3, Some(t - 120)), 3, false, t),
            "two minutes after the last one"
        );
        assert!(
            transcripts_due(&sent(3, Some(t - TRANSCRIPTS_GAP_SECS)), 3, false, t),
            "ten minutes later"
        );
        assert!(
            transcripts_due(&sent(3, None), 3, false, t),
            "sent by an older build that kept no time"
        );
    }

    #[test]
    fn a_forced_resync_or_a_lost_cloud_copy_sends_at_once() {
        let t = 1_000_000;
        assert!(transcripts_due(&sent(3, Some(t - 5)), 3, true, t), "forced");
        assert!(
            transcripts_due(&sent(3, Some(t - 5)), 0, false, t),
            "cloud copy removed"
        );
    }
}
