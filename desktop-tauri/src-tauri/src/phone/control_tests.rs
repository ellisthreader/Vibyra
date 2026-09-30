use super::control::{Control, LEASE_TAKEN, TYPING_OFF};
use std::{
    cell::Cell,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

fn allowed() -> Control {
    Control::new(Arc::new(AtomicBool::new(true)))
}

#[test]
fn nothing_is_typed_until_the_mac_turns_typing_on() {
    let typing = Arc::new(AtomicBool::new(false));
    let control = Control::new(typing.clone());
    assert_eq!(control.claim("phone", 1, &[1]), Err(TYPING_OFF.into()));
    typing.store(true, Ordering::SeqCst);
    let lease = control.claim("phone", 1, &[1]).unwrap();
    // Off again: a lease already held types nothing.
    typing.store(false, Ordering::SeqCst);
    let typed = control.input("phone", 1, &lease, "a", "ls\r", |_| {
        panic!("typed while off")
    });
    assert_eq!(typed, Err(TYPING_OFF.into()));
}

#[test]
fn the_newest_phone_to_open_a_terminal_takes_it() {
    let control = allowed();
    let lease = control.claim("phone-a", 1, &[1]).unwrap();
    assert_eq!(
        control.claim("phone-a", 1, &[1]).unwrap(),
        lease,
        "same phone, same lease"
    );
    control.release("phone-b", 1, &lease);
    control.release("phone-a", 1, "not-the-lease");
    let typed = std::cell::Cell::new(0);
    let write = |_: &[u8]| {
        typed.set(typed.get() + 1);
        Ok(())
    };
    control
        .input("phone-a", 1, &lease, "a1", "x", write)
        .unwrap();
    // A phone left on a desk must never leave the one in hand unable to type:
    // the newest claim wins, and the old lease is told why on its next key.
    let taken = control.claim("phone-b", 1, &[1]).unwrap();
    assert_ne!(taken, lease);
    let lost = control
        .input("phone-a", 1, &lease, "a2", "y", write)
        .unwrap_err();
    assert_eq!(lost, LEASE_TAKEN);
    assert_eq!(typed.get(), 1, "nothing was typed on the lost lease");
    control
        .input("phone-b", 1, &taken, "b1", "z", write)
        .unwrap();
    // Taking it back is the same claim again.
    let back = control.claim("phone-a", 1, &[1]).unwrap();
    control
        .input("phone-a", 1, &back, "a3", "w", write)
        .unwrap();
    assert_eq!(typed.get(), 3);
    control.release("phone-a", 1, &back);
    let second = control.claim("phone-b", 1, &[1]).unwrap();
    control.disconnected("phone-b");
    assert_ne!(control.claim("phone-a", 1, &[1]).unwrap(), second);
}

#[test]
fn input_needs_the_lease_and_an_id_is_typed_once() {
    let control = allowed();
    let lease = control.claim("phone", 1, &[1]).unwrap();
    let writes = Cell::new(0);
    let write = |_: &[u8]| {
        writes.set(writes.get() + 1);
        Ok(())
    };
    assert!(control
        .input("phone", 1, "stolen", "a", "ls\r", write)
        .is_err());
    assert!(control
        .input("other", 1, &lease, "a", "ls\r", write)
        .is_err());
    assert!(control
        .input("phone", 2, &lease, "a", "ls\r", write)
        .is_err());
    control
        .input("phone", 1, &lease, "a", "ls\r", write)
        .unwrap();
    // A lost acknowledgement is answered again, never typed a second time.
    control
        .input("phone", 1, &lease, "a", "ls\r", write)
        .unwrap();
    assert_eq!(writes.get(), 1);
    assert!(control
        .input("phone", 1, &lease, "a", "rm\r", write)
        .is_err());
    let oversized = "x".repeat(8193);
    for (id, data) in [
        ("", "x"),
        ("bad id", "x"),
        ("b", ""),
        ("b", oversized.as_str()),
    ] {
        assert!(control.input("phone", 1, &lease, id, data, write).is_err());
    }
    assert_eq!(writes.get(), 1);
}

#[test]
fn a_write_that_failed_can_be_sent_again() {
    let control = allowed();
    let lease = control.claim("phone", 1, &[1]).unwrap();
    let failed = control.input("phone", 1, &lease, "a", "ls\r", |_| Err("pty gone".into()));
    assert_eq!(failed, Err("pty gone".into()));
    let typed = Cell::new(false);
    control
        .input("phone", 1, &lease, "a", "ls\r", |_| {
            typed.set(true);
            Ok(())
        })
        .unwrap();
    assert!(typed.get());
}
