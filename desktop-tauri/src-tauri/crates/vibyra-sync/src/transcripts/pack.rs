use super::{discover, Manifest, SessionMeta};
use crate::error::{io_at, Result};
use std::io::Read;
use std::path::Path;

/// Packs the newest Claude and Codex sessions recorded in `root` into a tar at `out`. Returns the sessions
/// packed; when there are none, nothing is written. The tar is deterministic for unchanged sessions.
pub fn pack(project_name: &str, root: &Path, home: &Path, out: &Path) -> Result<Vec<SessionMeta>> {
    let mut found = discover::claude(home, root);
    found.extend(discover::codex(home, root));
    if found.is_empty() {
        return Ok(vec![]);
    }
    let sessions: Vec<SessionMeta> = found
        .iter()
        .map(|f| SessionMeta {
            provider: f.provider.into(),
            id: f.id.clone(),
            file: f.file.clone(),
            cwd: f.cwd.clone(),
            mtime: f.mtime,
            ran_in: None,
            cloud_at: None,
        })
        .collect();
    let manifest = serde_json::to_vec(&Manifest {
        project: project_name.into(),
        sessions: sessions.clone(),
    })?;
    let file = std::fs::File::create(out).map_err(|e| io_at("create", out, e))?;
    let mut tar = tar::Builder::new(std::io::BufWriter::new(file));
    let mut head = tar::Header::new_ustar();
    head.set_size(manifest.len() as u64);
    head.set_mode(0o644);
    head.set_mtime(0);
    tar.append_data(&mut head, "manifest.json", &manifest[..])?;
    for f in &found {
        let fh = std::fs::File::open(&f.path).map_err(|e| io_at("open", &f.path, e))?;
        let len = fh.metadata()?.len();
        let mut head = tar::Header::new_ustar();
        head.set_size(len);
        head.set_mode(0o644);
        head.set_mtime(f.mtime);
        // A session that grows while we read it is cut at the length we announced.
        tar.append_data(&mut head, &f.file, fh.take(len))?;
    }
    tar.into_inner()?
        .into_inner()
        .map_err(|e| e.into_error())?
        .sync_all()?;
    Ok(sessions)
}
