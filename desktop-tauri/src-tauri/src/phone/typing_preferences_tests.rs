use super::Sink;
use crate::phone::PhoneConnection;
use serde_json::{json, Value};
use std::sync::Arc;
use vibyra_core::pty::{FlushConfig, PtyManager};

#[test]
fn every_switch_persists_on_its_own_and_no_address_is_stored() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("phone");
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let saved = || -> Value {
        serde_json::from_slice(&std::fs::read(path.join("connection.json")).unwrap()).unwrap()
    };
    let reopened = |key: &str| {
        PhoneConnection::new(path.clone(), manager.clone())
            .lock()
            .status()[key]
            .clone()
    };
    let phone = PhoneConnection::new(path.clone(), manager.clone());
    {
        let mut phone = phone.lock();
        assert_eq!(phone.status()["enabled"], json!(false));
        assert_eq!(phone.status()["typing"], json!(false), "typing starts off");
        // Enabling can still fail on a machine with no usable network; the
        // switch stays on either way so the watcher can bind later.
        let _ = phone.enable(manager.clone());
        assert_eq!(phone.status()["enabled"], json!(true));
    }
    assert_eq!(
        saved(),
        json!({"enabled": true, "typing": false, "remote": false})
    );
    assert_eq!(reopened("enabled"), json!(true));
    {
        let mut phone = phone.lock();
        phone.disable().unwrap();
        assert_eq!(phone.status()["enabled"], json!(false));
        assert_eq!(phone.status()["discoverable"], json!(false));
        assert_eq!(phone.address(), "");
        // A connection nobody asked for is never started by the watcher.
        phone.refresh(manager.clone());
        assert_eq!(phone.status()["discoverable"], json!(false));
        // Allowing typing never turns the connection itself on.
        phone.set_typing(true).unwrap();
        assert_eq!(phone.status()["discoverable"], json!(false));
    }
    assert_eq!(
        saved(),
        json!({"enabled": false, "typing": true, "remote": false})
    );
    assert_eq!(reopened("typing"), json!(true));
    phone.lock().set_typing(false).unwrap();
    assert_eq!(reopened("typing"), json!(false));
    // Remote access is the third switch: persisted on its own, and never a
    // cloud leg without an account to register with.
    {
        let mut phone = phone.lock();
        phone.set_remote(true).unwrap();
        assert_eq!(phone.status()["remote"]["enabled"], json!(true));
        assert_eq!(phone.status()["remote"]["signedIn"], json!(false));
        assert_eq!(phone.status()["remote"]["leg"], json!(null));
        assert_eq!(
            phone.status()["enabled"],
            json!(false),
            "turning remote on never turns the connection on"
        );
    }
    assert_eq!(
        saved(),
        json!({"enabled": false, "typing": false, "remote": true})
    );
    assert_eq!(reopened("remote")["enabled"], json!(true));
    phone.lock().set_remote(false).unwrap();
    assert_eq!(reopened("remote")["enabled"], json!(false));
    assert!(PhoneConnection::new(path.clone(), manager.clone())
        .lock()
        .host()
        .is_err());
    manager.shutdown();
}
