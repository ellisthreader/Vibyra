//! Exercise the real Swift action expansion without posting any OS events.
use super::*;
#[test]
fn swift_batches_stop_at_revoke_and_release_only_posted_downs() {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("native/window-preview");
    let temp = tempfile::tempdir().unwrap();
    let executable = temp.path().join("input-authority-tests");
    let output = std::process::Command::new("xcrun")
        .arg("swiftc")
        .arg(base.join("InputAuthority.swift"))
        .arg(base.join("Keys.swift"))
        .arg(base.join("tests/InputAuthorityTests.swift"))
        .arg("-o")
        .arg(&executable)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let output = std::process::Command::new(executable).output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
#[test]
fn borrowed_callback_survives_thread_hop_and_denies_panics_or_missing_context() {
    let valid = std::sync::atomic::AtomicBool::new(true);
    let check = || {
        valid
            .load(std::sync::atomic::Ordering::SeqCst)
            .then_some(())
            .ok_or("revoked".into())
    };
    let context = Context { check: &check };
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let pointer = (&context as *const Context<'_>).cast();
                assert_eq!(unsafe { verify(pointer) }, 1);
                valid.store(false, std::sync::atomic::Ordering::SeqCst);
                assert_eq!(unsafe { verify(pointer) }, 0);
            })
            .join()
            .unwrap();
    });
    assert_eq!(unsafe { verify(std::ptr::null()) }, 0);
    let panics = || -> Result<(), String> { panic!("intentional fail-closed callback test") };
    let context = Context { check: &panics };
    assert_eq!(
        unsafe { verify((&context as *const Context<'_>).cast()) },
        0
    );
}
