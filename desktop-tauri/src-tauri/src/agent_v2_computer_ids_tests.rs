//! F-18: ids the backend supplies are plain UUIDs, and a run may only use a
//! folder grant that belongs to its own teammate on this account and Mac.

use super::super::exec::grant_fits;
use super::plain_id;
use crate::agent_computer_store::Grant;
use std::path::PathBuf;

const GRANT: &str = "11111111-2222-4333-8444-555555555555";
const TEAMMATE: &str = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER: &str = "bbbbbbbb-0000-4000-8000-000000000002";

fn grant() -> Grant {
    Grant {
        id: GRANT.into(),
        agent_id: TEAMMATE.into(),
        host_id: "host".into(),
        account_scope: "account".into(),
        label: "Project".into(),
        path: PathBuf::from("/tmp/project"),
        source_path: None,
        path_identity: None,
        source_identity: None,
        can_write: false,
        revoked: false,
    }
}

#[test]
fn only_plain_uuids_reach_a_request_path() {
    assert!(plain_id(GRANT));
    for bad in [
        "",
        "ws",
        "../../runs",
        "11111111-2222-4333-8444-55555555555",
        "11111111-2222-4333-8444-5555555555555",
        "11111111-2222-4333-8444-55555555555/",
        "11111111-2222-4333-8444-5555555555zz",
        "11111111/2222/4333/8444/555555555555",
        "%2e%2e%2f11111111-2222-4333-8444-5555555",
        "11111111-2222-4333-8444-555555555555?x=1",
    ] {
        assert!(!plain_id(bad), "{bad:?}");
    }
}

#[test]
fn a_run_only_uses_its_own_teammates_grant_on_this_account_and_mac() {
    let g = grant();
    assert!(grant_fits(&g, GRANT, TEAMMATE, "account", "host"));
    assert!(
        !grant_fits(&g, GRANT, OTHER, "account", "host"),
        "another teammate's folder"
    );
    assert!(
        !grant_fits(&g, OTHER, TEAMMATE, "account", "host"),
        "a different grant id"
    );
    assert!(!grant_fits(&g, GRANT, TEAMMATE, "someone-else", "host"));
    assert!(!grant_fits(&g, GRANT, TEAMMATE, "account", "other-mac"));
    let revoked = Grant {
        revoked: true,
        ..grant()
    };
    assert!(!grant_fits(&revoked, GRANT, TEAMMATE, "account", "host"));
}
