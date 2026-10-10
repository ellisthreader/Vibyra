use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;
async fn wait_until(check: impl Fn() -> bool) {
    tokio::time::timeout(Duration::from_secs(2), async {
        while !check() {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .unwrap();
}
#[tokio::test]
async fn three_jobs_overlap_one_cancel_does_not_stop_peers_and_reaping_precedes_reuse() {
    let mut pool = Pool::default();
    pool.bind("account-a".into()).await;
    let active = Arc::new(AtomicUsize::new(0));
    let cleaned = Arc::new(AtomicUsize::new(0));
    let mut controls = Vec::new();
    for slot in 0..SLOTS {
        let control = Arc::new(Control::default());
        controls.push(control.clone());
        let (live, done, stop) = (active.clone(), cleaned.clone(), control.clone());
        assert!(
            pool.start(slot, format!("task-{slot}"), control, async move {
                live.fetch_add(1, Ordering::SeqCst);
                while !stop.cancel.load(Ordering::SeqCst) && !stop.stale.load(Ordering::SeqCst) {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
                tokio::time::sleep(Duration::from_millis(30)).await;
                live.fetch_sub(1, Ordering::SeqCst);
                done.fetch_add(1, Ordering::SeqCst);
                Outcome::Cancelled
            })
        );
    }
    wait_until(|| active.load(Ordering::SeqCst) == 3).await;
    assert!(pool.available().is_empty());
    assert!(!pool.start(
        0,
        "replacement".into(),
        Arc::new(Control::default()),
        async { Outcome::Completed }
    ));
    controls[1].cancel.store(true, Ordering::SeqCst);
    assert!(pool.available().is_empty());
    wait_until(|| cleaned.load(Ordering::SeqCst) == 1).await;
    assert_eq!(pool.reap().await, vec![Outcome::Cancelled]);
    assert_eq!(pool.available(), vec![1]);
    assert_eq!(active.load(Ordering::SeqCst), 2);
    assert!(!controls[0].stale.load(Ordering::SeqCst));
    pool.bind("account-b".into()).await;
    assert_eq!(active.load(Ordering::SeqCst), 0);
    assert_eq!(cleaned.load(Ordering::SeqCst), 3);
    assert_eq!(pool.available(), vec![0, 1, 2]);
}
#[tokio::test]
async fn dropping_pool_signals_owned_jobs_without_aborting_their_cleanup() {
    let mut pool = Pool::default();
    let control = Arc::new(Control::default());
    let stop = control.clone();
    let cleaned = Arc::new(AtomicUsize::new(0));
    let done = cleaned.clone();
    pool.start(0, "task".into(), control, async move {
        while !stop.stale.load(Ordering::SeqCst) {
            tokio::task::yield_now().await;
        }
        done.store(1, Ordering::SeqCst);
        Outcome::Stale
    });
    drop(pool);
    wait_until(|| cleaned.load(Ordering::SeqCst) == 1).await;
}
