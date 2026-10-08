use super::{build_for, find_resolved, ServerSpec};
use std::collections::BTreeMap;

#[test]
fn windows_environment_names_are_canonical_and_explicit_values_win() {
    let parent = BTreeMap::from([
        ("Path".into(), "parent-tools".into()),
        ("SystemRoot".into(), "windows-root".into()),
        ("openai_api_key".into(), "parent-secret".into()),
        ("Ld_Preload".into(), "parent-loader".into()),
    ]);
    let mut spec = ServerSpec::default();
    spec.env.insert("path".into(), "approved-tools".into());
    spec.env
        .insert("CustomName".into(), "approved-value".into());
    let secrets = BTreeMap::from([("customname".into(), "saved-secret".into())]);
    let got = build_for(true, &spec, &parent, &secrets);
    assert!(got.contains(&("PATH".into(), "approved-tools".into())));
    assert!(got.contains(&("SYSTEMROOT".into(), "windows-root".into())));
    assert!(got.contains(&("CUSTOMNAME".into(), "saved-secret".into())));
    assert_eq!(
        got.len(),
        3,
        "no parent secret or loader variable is inherited"
    );
}

#[test]
fn unix_environment_case_and_proxy_names_remain_distinct() {
    let parent = BTreeMap::from([
        ("Path".into(), "not-unix-path".into()),
        ("PATH".into(), "tools".into()),
        ("HTTP_PROXY".into(), "upper-proxy".into()),
        ("http_proxy".into(), "lower-proxy".into()),
    ]);
    let got = build_for(false, &ServerSpec::default(), &parent, &BTreeMap::new());
    assert_eq!(got.len(), 3);
    assert!(got.contains(&("HTTP_PROXY".into(), "upper-proxy".into())));
    assert!(got.contains(&("http_proxy".into(), "lower-proxy".into())));
}

#[test]
fn windows_native_executable_resolution_uses_only_supplied_path() {
    let folder = tempfile::tempdir().unwrap();
    let node = folder.path().join("node.exe");
    std::fs::write(&node, []).unwrap();
    let env = vec![("Path".into(), folder.path().to_str().unwrap().into())];
    assert_eq!(find_resolved(true, "node", &env), Some(node.clone()));
    assert_eq!(find_resolved(true, "node.exe", &env), Some(node));
    assert!(find_resolved(false, "node", &env).is_none());
    assert!(find_resolved(true, "node", &[]).is_none());
    let empty = tempfile::tempdir().unwrap();
    let denied = vec![("PATH".into(), empty.path().to_str().unwrap().into())];
    assert!(find_resolved(true, "node", &denied).is_none());
}

#[test]
fn explicit_paths_and_existing_shims_do_not_gain_a_shell_fallback() {
    let folder = tempfile::tempdir().unwrap();
    let shim = folder.path().join("npm.cmd");
    std::fs::write(&shim, []).unwrap();
    let env = vec![("PATH".into(), folder.path().to_str().unwrap().into())];
    assert_eq!(find_resolved(true, "npm.cmd", &env), Some(shim.clone()));
    assert_eq!(find_resolved(true, shim.to_str().unwrap(), &[]), Some(shim));
    std::fs::write(folder.path().join("arbitrary.cmd"), []).unwrap();
    assert!(find_resolved(true, "arbitrary", &env).is_none());
    assert!(find_resolved(true, "missing.exe", &env).is_none());
}
