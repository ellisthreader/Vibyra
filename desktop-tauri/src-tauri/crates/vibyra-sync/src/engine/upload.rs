//! Seal a plaintext file to the cloud computer's key and upload it, recovering from `seq_conflict`
//! and `resync_required` by re-reading the project.
use super::Engine;
use crate::client::{Project, UploadParams};
use crate::crypto::seal_stream;
use crate::error::{io_at, Result, SyncError};
use std::path::{Path, PathBuf};

/// What `prepare` returns for one attempt.
pub(crate) struct Prepared {
    pub plain: PathBuf,
    pub base_seq: u64,
    pub head: Option<String>,
}

pub(crate) struct Uploaded {
    pub project: Project,
    pub seq: u64,
    pub base_seq: u64,
    pub bytes: u64,
}

impl Engine {
    pub(crate) fn upload(
        &self,
        key: &str,
        name: &str,
        kind: &str,
        mut project: Project,
        vm_key: &[u8; 32],
        prepare: &dyn Fn(&Project, bool) -> Result<Prepared>,
    ) -> Result<Uploaded> {
        let tmp = self.tmp(key)?;
        let sealed_path = tmp.join(format!("{kind}.sealed"));
        let mut force_full = false;
        let mut last = SyncError::Invalid("upload did not run".into());
        for _ in 0..3 {
            let prepared = prepare(&project, force_full)?;
            let seq = if kind == "code" {
                project.up_seq
            } else {
                project.transcripts_seq
            } + 1;
            let sealed = seal_file(vm_key, &prepared.plain, &sealed_path)?;
            let params = UploadParams {
                name,
                kind,
                seq,
                base_seq: prepared.base_seq,
                head: prepared.head.as_deref(),
                sha256: &sealed.sha256,
            };
            let result = self.client.put_up(&params, &sealed_path);
            let _ = std::fs::remove_file(&sealed_path);
            match result {
                Ok(p) => {
                    return Ok(Uploaded {
                        project: p,
                        seq,
                        base_seq: prepared.base_seq,
                        bytes: sealed.bytes,
                    })
                }
                Err(e) if matches!(e.code(), Some("seq_conflict")) => {
                    project = self.client.post_project(key, name, None)?;
                    last = e;
                }
                Err(e) if matches!(e.code(), Some("resync_required")) => {
                    force_full = true;
                    project = self.client.post_project(key, name, None)?;
                    last = e;
                }
                Err(e) => return Err(e),
            }
        }
        Err(last)
    }
}

fn seal_file(vm_key: &[u8; 32], plain: &Path, out: &Path) -> Result<crate::crypto::Sealed> {
    let mut src =
        std::io::BufReader::new(std::fs::File::open(plain).map_err(|e| io_at("open", plain, e))?);
    let mut dst =
        std::io::BufWriter::new(std::fs::File::create(out).map_err(|e| io_at("create", out, e))?);
    let sealed = seal_stream(vm_key, &mut src, &mut dst)?;
    dst.into_inner().map_err(|e| e.into_error())?.sync_all()?;
    Ok(sealed)
}
