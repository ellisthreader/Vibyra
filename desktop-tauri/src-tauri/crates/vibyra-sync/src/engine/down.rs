//! Cloud to Mac: download, open, fetch into the shadow repo as `refs/vibyra/cloud`, report what changed.
use super::{DownOptions, DownReport, Engine};
use crate::bundle::{fetch_bundle, verify_bundle, CLOUD_REF};
use crate::client::DownItem;
use crate::cloud::{diff_files, find_base, CloudChange};
use crate::crypto::open_stream;
use crate::error::{io_at, Result, SyncError};
use crate::git::ensure_shadow;
use crate::paths::shadow_dir;
use crate::state::ProjectState;
use std::path::{Path, PathBuf};

impl Engine {
    /// `GET /down?mac=` and apply each blob to the shadow repo. Returns the new cloud snapshots.
    pub fn poll_down(&self, mac_id: &str) -> Result<Vec<CloudChange>> {
        Ok(self
            .poll_down_with(mac_id, &DownOptions::default())?
            .changes)
    }

    pub fn poll_down_with(&self, mac_id: &str, opts: &DownOptions) -> Result<DownReport> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut items = self.client.list_down(mac_id)?;
        items.sort_by(|a, b| (&a.project, &a.kind, a.seq).cmp(&(&b.project, &b.kind, b.seq)));
        let mut report = DownReport::default();
        for item in items {
            let Some(mut st) = self.store.find_by_name(&item.project) else {
                report.ignored.push(item.project.clone());
                continue;
            };
            match self.receive(&item, &mut st, opts, &mut report) {
                Ok(()) => {
                    self.store.save(&st)?;
                    // A lost ack just means the blob is offered again; applying it twice is harmless.
                    let _ = self.client.ack_down(&item.id, true, None);
                }
                Err(e) => {
                    report.errors.push((item.project.clone(), e.to_string()));
                    let _ = self.client.ack_down(&item.id, false, Some(&e.to_string()));
                }
            }
        }
        Ok(report)
    }

    fn receive(
        &self,
        item: &DownItem,
        st: &mut ProjectState,
        opts: &DownOptions,
        report: &mut DownReport,
    ) -> Result<()> {
        let tmp = self.tmp(&st.project_key)?;
        let sealed: PathBuf = tmp.join(format!("down-{}.sealed", safe(&item.id)));
        let plain: PathBuf = tmp.join(format!("down-{}.plain", safe(&item.id)));
        let result = self.receive_files(item, st, opts, report, &sealed, &plain);
        let _ = std::fs::remove_file(&sealed);
        let _ = std::fs::remove_file(&plain);
        result
    }

    fn receive_files(
        &self,
        item: &DownItem,
        st: &mut ProjectState,
        opts: &DownOptions,
        report: &mut DownReport,
        sealed: &Path,
        plain: &Path,
    ) -> Result<()> {
        self.client.download_down(&item.id, sealed, &item.sha256)?;
        {
            let mut src = std::io::BufReader::new(
                std::fs::File::open(sealed).map_err(|e| io_at("open", sealed, e))?,
            );
            let mut dst = std::io::BufWriter::new(
                std::fs::File::create(plain).map_err(|e| io_at("create", plain, e))?,
            );
            open_stream(self.keys.secret(), &mut src, &mut dst)?;
            dst.into_inner().map_err(|e| e.into_error())?.sync_all()?;
        }
        match item.kind.as_str() {
            "code" => {
                let shadow = shadow_dir(&self.state_dir, &st.project_key);
                ensure_shadow(&shadow)?;
                let (name, sha) = verify_bundle(&shadow, plain)?;
                if name != CLOUD_REF {
                    return Err(SyncError::Invalid(format!(
                        "a cloud bundle must carry {CLOUD_REF}"
                    )));
                }
                if item
                    .head
                    .as_deref()
                    .is_some_and(|h| h.len() == 40 && h != sha)
                {
                    return Err(SyncError::Invalid(
                        "the bundle's head does not match the announced head".into(),
                    ));
                }
                let head = fetch_bundle(&shadow, plain, CLOUD_REF, CLOUD_REF)?;
                let base = find_base(&shadow, &head, st.up_head.as_deref());
                let files = diff_files(&shadow, base.as_deref(), &head)?;
                let change = CloudChange {
                    project_key: st.project_key.clone(),
                    project: st.name.clone(),
                    seq: item.seq,
                    head,
                    base,
                    files,
                };
                st.cloud = vec![change.clone()];
                report.changes.push(change);
            }
            "transcripts" => {
                if !opts.skip_transcripts {
                    if let Some(home) = opts.home.clone().or_else(dirs::home_dir) {
                        // Tools record the real path of the folder they ran in.
                        let root = std::fs::canonicalize(&st.root)
                            .unwrap_or_else(|_| PathBuf::from(&st.root));
                        let written = crate::transcripts::unpack(plain, &home, &root)?;
                        crate::returned::record(&mut st.returned, &written);
                        report.transcripts_imported += written.len();
                    }
                }
            }
            other => return Err(SyncError::Invalid(format!("unknown blob kind {other}"))),
        }
        Ok(())
    }
}

fn safe(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(64)
        .collect()
}
