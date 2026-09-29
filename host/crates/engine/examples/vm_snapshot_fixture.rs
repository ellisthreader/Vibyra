//! Disposable verifier bridge. This example is not an Agent command tool.
#[cfg(unix)]
fn run() -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use serde_json::json;
    use std::path::PathBuf;
    use vibyra_host_engine::Engine;

    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() < 5 {
        return Err("expected root, state directory, device, inode and exact file paths".into());
    }
    let root = PathBuf::from(&args[0]);
    let state = PathBuf::from(&args[1]);
    let device = args[2].parse::<u64>().map_err(|e| e.to_string())?;
    let inode = args[3].parse::<u64>().map_err(|e| e.to_string())?;
    let engine = Engine::new_read_only(state, "VM fixture".into(), root)?;
    let snapshot = engine.snapshot_approved_files((device, inode), &args[4..])?;
    let files: Vec<_> = snapshot
        .files
        .into_iter()
        .map(|file| {
            json!({
                "path": file.path,
                "mode": file.mode,
                "sha256": file.sha256,
                "base64": STANDARD.encode(file.content),
            })
        })
        .collect();
    println!(
        "{}",
        json!({"fingerprint": snapshot.fingerprint, "files": files})
    );
    Ok(())
}

fn main() {
    #[cfg(unix)]
    if let Err(error) = run() {
        eprintln!("VM fixture snapshot failed: {error}");
        std::process::exit(1);
    }
    #[cfg(not(unix))]
    {
        eprintln!("VM fixture snapshot requires Unix");
        std::process::exit(1);
    }
}
