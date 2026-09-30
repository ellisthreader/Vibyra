//! A queued request cannot borrow authority or a token from before its wait.
use super::*;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Barrier,
};
fn session() -> Arc<Session> {
    Arc::new(Session {
        decoded: AtomicBool::new(true),
        target: Target {
            id: 9988,
            pid: 8877,
            control: true,
        },
        token: Mutex::new(Some("test-only-session".into())),
        seen: Mutex::new(Instant::now()),
        sequence: Mutex::new(0),
    })
}
#[test]
fn revoke_while_waiting_for_sequence_emits_nothing() {
    let session = session();
    let valid = AtomicBool::new(true);
    let effects = AtomicUsize::new(0);
    let barrier = Barrier::new(2);
    let held = session.sequence.lock();
    std::thread::scope(|scope| {
        let task = scope.spawn(|| {
            barrier.wait();
            session.input_with(
                json!({"sequence":1}),
                &|| {
                    valid
                        .load(Ordering::SeqCst)
                        .then_some(())
                        .ok_or("revoked".into())
                },
                |_, check| {
                    check()?;
                    effects.fetch_add(1, Ordering::SeqCst);
                    Ok(b"{\"focus\":null}".to_vec())
                },
            )
        });
        barrier.wait();
        valid.store(false, Ordering::SeqCst);
        drop(held);
        assert!(task.join().unwrap().is_err());
    });
    assert_eq!(effects.load(Ordering::SeqCst), 0);
    valid.store(true, Ordering::SeqCst);
    session
        .input_with(json!({"sequence":2}), &|| Ok(()), |_, check| {
            check()?;
            effects.fetch_add(1, Ordering::SeqCst);
            Ok(b"{}".to_vec())
        })
        .unwrap();
    assert_eq!(
        effects.load(Ordering::SeqCst),
        1,
        "explicit current local authority still works"
    );
}
#[test]
fn closed_token_after_sequence_wait_emits_nothing() {
    let session = session();
    let effects = AtomicUsize::new(0);
    let barrier = Barrier::new(2);
    let held = session.sequence.lock();
    std::thread::scope(|scope| {
        let task = scope.spawn(|| {
            barrier.wait();
            session.input_with(json!({"sequence":1}), &|| Ok(()), |_, check| {
                check()?;
                effects.fetch_add(1, Ordering::SeqCst);
                Ok(b"{}".to_vec())
            })
        });
        barrier.wait();
        session.close();
        drop(held);
        assert!(task.join().unwrap().is_err());
    });
    assert_eq!(effects.load(Ordering::SeqCst), 0);
}
