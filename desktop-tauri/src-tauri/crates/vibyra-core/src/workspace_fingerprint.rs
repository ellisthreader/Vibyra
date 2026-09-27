//! What Safe mode's approval is bound to: HEAD, the status list, the binary
//! diff against HEAD and every untracked file's content.
//!
//! The launch refuses a fingerprint that differs from the one the user
//! approved, so both are computed here, by the same code, moments apart. The
//! inputs are streamed rather than held: a binary diff of a large change, or
//! one big untracked file, used to be read whole into memory first.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::{ErrorKind, Read};
use std::path::Path;
use std::process::{Command, Output, Stdio};

use crate::parallel::map_parallel;
use crate::workspace_preflight::{command_bytes, git_result};
use crate::CoreResult;

const CHUNK: usize = 64 * 1024;

pub(crate) fn fingerprint(repo: &Path, status: &[u8]) -> CoreResult<String> {
    let mut hasher = DefaultHasher::new();
    command_bytes(repo, &["rev-parse", "HEAD"])?.hash(&mut hasher);
    status.hash(&mut hasher);
    stream_digest(repo, &["diff", "--binary", "HEAD", "--", "."])?.hash(&mut hasher);
    let untracked = command_bytes(repo, &["ls-files", "--others", "--exclude-standard", "-z"])?;
    let paths: Vec<&[u8]> = untracked
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .collect();

    // Safe mode blocks the terminal launch until this returns, and an
    // untracked tree can be thousands of files, so read and digest them in
    // parallel. `map_parallel` preserves order, which keeps the combined
    // fingerprint deterministic for a given working tree.
    let digests = map_parallel(&paths, |relative| {
        file_digest(&repo.join(String::from_utf8_lossy(relative).as_ref()))
    });
    for (relative, digest) in paths.iter().zip(digests) {
        relative.hash(&mut hasher);
        digest.hash(&mut hasher);
    }
    Ok(format!("{:016x}", hasher.finish()))
}

/// A digest of everything `git args` prints, read a chunk at a time.
fn stream_digest(repo: &Path, args: &[&str]) -> CoreResult<u64> {
    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stderr = child.stderr.take();
    let errors = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        if let Some(stderr) = stderr.as_mut() {
            let _ = stderr.read_to_end(&mut bytes);
        }
        bytes
    });
    let mut digest = DefaultHasher::new();
    let read = match child.stdout.take() {
        Some(stdout) => feed(stdout, &mut digest),
        None => Ok(0),
    };
    if let Err(error) = read {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error.into());
    }
    let status = child.wait()?;
    let stderr = errors.join().unwrap_or_default();
    if status.success() {
        return Ok(digest.finish());
    }
    let output = Output {
        status,
        stdout: Vec::new(),
        stderr,
    };
    git_result(output, args.join(" ")).map(|_| 0)
}

/// The same digest `std::fs::read(path)?.hash(..)` gives, without holding the
/// file: a byte slice hashes as its length and then its bytes, and the hasher
/// does not care how the bytes are split between writes.
fn file_digest(path: &Path) -> Option<u64> {
    let file = std::fs::File::open(path).ok()?;
    let mut digest = DefaultHasher::new();
    digest.write_usize(file.metadata().ok()?.len() as usize);
    feed(file, &mut digest).ok()?;
    Some(digest.finish())
}

fn feed(mut source: impl Read, digest: &mut DefaultHasher) -> std::io::Result<u64> {
    let mut chunk = vec![0u8; CHUNK];
    let mut total = 0;
    loop {
        match source.read(&mut chunk) {
            Ok(0) => return Ok(total),
            Ok(read) => {
                digest.write(&chunk[..read]);
                total += read as u64;
            }
            Err(error) if error.kind() == ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_streamed_file_digests_exactly_like_one_read_whole() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("large.bin");
        let content: Vec<u8> = (0..CHUNK * 3 + 17).map(|i| (i % 251) as u8).collect();
        std::fs::write(&path, &content).unwrap();
        let mut whole = DefaultHasher::new();
        std::fs::read(&path).unwrap().hash(&mut whole);
        assert_eq!(file_digest(&path), Some(whole.finish()));
        assert_eq!(file_digest(&temp.path().join("missing")), None);
    }
}
