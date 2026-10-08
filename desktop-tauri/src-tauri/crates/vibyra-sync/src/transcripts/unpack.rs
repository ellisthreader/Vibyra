use super::{
    cwd::rewrite_line,
    discover::{claude_dir_name, mtime_of, safe_id, MAX_SESSION_BYTES},
    Manifest, SessionMeta,
};
use crate::error::{io_at, Result, SyncError};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};

fn manifest_of(tar_path: &Path) -> Result<Manifest> {
    let mut ar =
        tar::Archive::new(std::fs::File::open(tar_path).map_err(|e| io_at("open", tar_path, e))?);
    for entry in ar.entries()? {
        let mut entry = entry?;
        if entry.path()?.to_str() == Some("manifest.json") && entry.header().entry_type().is_file()
        {
            let mut buf = vec![];
            entry.by_ref().take(1 << 20).read_to_end(&mut buf)?;
            return Ok(serde_json::from_slice(&buf)?);
        }
    }
    Err(SyncError::Invalid(
        "transcripts archive has no manifest".into(),
    ))
}

/// Where a session lands under `home`: Claude by the local folder's name, Codex by the date in its file name.
fn destination(home: &Path, local_root: &Path, s: &SessionMeta) -> Option<PathBuf> {
    match s.provider.as_str() {
        "claude" if safe_id(&s.id) && s.file == format!("claude/{}.jsonl", s.id) => Some(
            home.join(".claude/projects")
                .join(claude_dir_name(&local_root.to_string_lossy()))
                .join(format!("{}.jsonl", s.id)),
        ),
        "codex" => {
            let name = s.file.strip_prefix("codex/")?;
            let stem = name.strip_suffix(".jsonl")?;
            let date = stem.strip_prefix("rollout-")?.get(..10)?; // YYYY-MM-DD
            let ok = date.bytes().enumerate().all(|(i, b)| {
                if i == 4 || i == 7 {
                    b == b'-'
                } else {
                    b.is_ascii_digit()
                }
            });
            (ok && safe_id(stem)).then(|| {
                home.join(".codex/sessions")
                    .join(&date[..4])
                    .join(&date[5..7])
                    .join(&date[8..])
                    .join(name)
            })
        }
        _ => None,
    }
}

/// Rewrites the session's `cwd` to `local_root` while copying; the file lands atomically with the session's
/// mtime. An existing local file at least as new is kept. Returns the sessions actually written.
pub fn unpack(tar_path: &Path, home: &Path, local_root: &Path) -> Result<Vec<SessionMeta>> {
    let manifest = manifest_of(tar_path)?;
    let to = local_root.to_string_lossy().into_owned();
    let mut written = vec![];
    let mut ar =
        tar::Archive::new(std::fs::File::open(tar_path).map_err(|e| io_at("open", tar_path, e))?);
    for entry in ar.entries()? {
        let entry = entry?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let name = entry.path()?.to_string_lossy().into_owned();
        let Some(meta) = manifest.sessions.iter().find(|s| s.file == name) else {
            continue;
        };
        let Some(dest) = destination(home, local_root, meta) else {
            continue;
        };
        if entry.header().size()? > MAX_SESSION_BYTES {
            continue;
        }
        if std::fs::metadata(&dest).is_ok_and(|m| mtime_of(&m) >= meta.mtime) {
            continue;
        }
        let dir = dest
            .parent()
            .ok_or_else(|| SyncError::Invalid("bad destination".into()))?;
        std::fs::create_dir_all(dir).map_err(|e| io_at("create", dir, e))?;
        let tmp = dir.join(format!(".{}.tmp", uuid::Uuid::new_v4().simple()));
        let result = copy_rewritten(entry, &tmp, &meta.cwd, &to, meta.mtime);
        if let Err(e) = result.and_then(|_| std::fs::rename(&tmp, &dest).map_err(Into::into)) {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
        written.push(meta.clone());
    }
    Ok(written)
}

fn copy_rewritten(entry: impl Read, tmp: &Path, from: &str, to: &str, mtime: u64) -> Result<()> {
    let file = std::fs::File::create(tmp).map_err(|e| io_at("create", tmp, e))?;
    let mut out = std::io::BufWriter::new(file);
    let mut reader = BufReader::new(entry);
    let mut line = vec![];
    loop {
        line.clear();
        if reader.read_until(b'\n', &mut line)? == 0 {
            break;
        }
        match rewrite_line(&line, from, to) {
            Some(new) => out.write_all(&new)?,
            None => out.write_all(&line)?,
        }
    }
    let file = out.into_inner().map_err(|e| e.into_error())?;
    file.set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(mtime))?;
    file.sync_all()?;
    Ok(())
}
