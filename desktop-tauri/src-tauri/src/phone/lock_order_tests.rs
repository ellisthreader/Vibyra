//! Real status polling racing account-bound login/logout cleanup must finish.
use crate::{account_session::AccountSessionManager, account_types::AccountProfile};
use std::{
    sync::{mpsc, Arc},
    time::Duration,
};
use vibyra_core::pty::{FlushConfig, OutputSink, PtyManager};
struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}
#[test]
fn status_never_waits_on_account_while_holding_phone_during_login_or_logout() {
    for signing_in in [false, true] {
        let directory = tempfile::tempdir().unwrap();
        let account = Arc::new(AccountSessionManager::default());
        account.set_test_session("A", AccountProfile::default());
        let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
        let phone = Arc::new(super::PhoneConnection::with_chats(
            directory.path().to_path_buf(),
            manager.clone(),
            None,
            Some(account.clone()),
        ));
        let (captured_tx, captured_rx) = mpsc::channel();
        let (account_locked_tx, account_locked_rx) = mpsc::channel();
        let (phone_locked_tx, phone_locked_rx) = mpsc::channel();
        let (done_tx, done_rx) = mpsc::channel();
        let (poll_account, poll_phone) = (account.clone(), phone.clone());
        let poll_done = done_tx.clone();
        let poll = std::thread::spawn(move || {
            let signed_in = poll_account.token().is_some();
            captured_tx.send(()).unwrap();
            account_locked_rx
                .recv_timeout(Duration::from_secs(2))
                .unwrap();
            let phone = poll_phone.lock();
            phone_locked_tx.send(()).unwrap();
            assert_eq!(phone.status(signed_in)["remote"]["signedIn"], true);
            poll_done.send(()).unwrap();
        });
        captured_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        let auth = std::thread::spawn(move || {
            account
                .with_token("A", || {
                    account_locked_tx.send(()).unwrap();
                    phone_locked_rx
                        .recv_timeout(Duration::from_secs(2))
                        .unwrap();
                    let mut phone = phone.lock();
                    if signing_in {
                        phone.account_signed_in();
                    } else {
                        phone.account_signed_out();
                    }
                })
                .unwrap();
            done_tx.send(()).unwrap();
        });
        for _ in 0..2 {
            done_rx
                .recv_timeout(Duration::from_secs(3))
                .expect("account/phone lock inversion");
        }
        poll.join().unwrap();
        auth.join().unwrap();
        manager.shutdown();
    }
}
