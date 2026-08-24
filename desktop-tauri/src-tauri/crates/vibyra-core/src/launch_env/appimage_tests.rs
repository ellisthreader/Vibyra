use super::{plan, EnvFix};

const MOUNT: &str = "/tmp/.mount_VibyraXY";

fn vars(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
    pairs
        .iter()
        .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
        .collect()
}

#[test]
fn a_non_appimage_process_needs_no_fix() {
    let fix = plan("", vars(&[("PATH", "/usr/bin")]));
    assert_eq!(fix, EnvFix::default());
    assert!(fix.is_empty());
}

#[test]
fn variables_wholly_inside_the_mount_are_removed() {
    // The exact values this machine's AppImage runtime exports, which break
    // python3 inside a Vibyra terminal.
    let fix = plan(
        MOUNT,
        vars(&[
            ("PYTHONHOME", &format!("{MOUNT}/usr/")),
            ("PYTHONPATH", &format!("{MOUNT}/usr/share/pyshared/:")),
            ("PERLLIB", &format!("{MOUNT}/usr/share/perl5/:")),
            (
                "LD_LIBRARY_PATH",
                &format!("{MOUNT}/usr/lib/:{MOUNT}/usr/lib64"),
            ),
        ]),
    );
    assert_eq!(
        fix.remove,
        ["LD_LIBRARY_PATH", "PERLLIB", "PYTHONHOME", "PYTHONPATH"]
    );
    assert!(fix.set.is_empty());
}

#[test]
fn mixed_search_paths_keep_their_entries_outside_the_mount() {
    let fix = plan(
        MOUNT,
        vars(&[
            (
                "XDG_DATA_DIRS",
                &format!("{MOUNT}/usr/share/:{MOUNT}//usr/share:/usr/share:/usr/local/share"),
            ),
            ("PATH", &format!("{MOUNT}/usr/bin/:/usr/bin:/bin")),
        ]),
    );
    assert!(fix.remove.is_empty());
    assert_eq!(
        fix.set,
        [
            ("PATH".to_owned(), "/usr/bin:/bin".to_owned()),
            (
                "XDG_DATA_DIRS".to_owned(),
                "/usr/share:/usr/local/share".to_owned()
            ),
        ]
    );
}

#[test]
fn stacked_appimage_mounts_are_all_removed_after_relaunch() {
    let old_mount = "/tmp/.mount_VibyraOLD123";
    let fix = plan(
        MOUNT,
        vars(&[(
            "LD_LIBRARY_PATH",
            &format!("{MOUNT}/usr/lib:{old_mount}/usr/lib:/opt/vendor/lib:/usr/lib"),
        )]),
    );
    assert!(fix.remove.is_empty());
    assert_eq!(
        fix.set,
        [(
            "LD_LIBRARY_PATH".to_owned(),
            "/opt/vendor/lib:/usr/lib".to_owned()
        )]
    );
}

#[test]
fn a_variable_owned_only_by_a_stale_mount_is_removed() {
    let fix = plan(
        MOUNT,
        vars(&[("PYTHONHOME", "/tmp/.mount_VibyraOLD123/usr")]),
    );
    assert_eq!(fix.remove, ["PYTHONHOME"]);
    assert!(fix.set.is_empty());
}

#[test]
fn the_runtimes_own_markers_are_always_dropped() {
    let fix = plan(
        MOUNT,
        vars(&[
            ("APPDIR", MOUNT),
            ("APPIMAGE", "/home/user/Vibyra.AppImage"),
            ("OWD", "/home/user"),
            ("ARGV0", "./Vibyra.AppImage"),
        ]),
    );
    assert_eq!(fix.remove, ["APPDIR", "APPIMAGE", "ARGV0", "OWD"]);
    assert!(fix.set.is_empty());
}

#[test]
fn a_non_mount_sibling_with_a_shared_prefix_is_left_alone() {
    let fix = plan(
        MOUNT,
        vars(&[("LD_LIBRARY_PATH", "/tmp/.mountVibyraXY2/usr/lib:/usr/lib")]),
    );
    assert!(fix.remove.is_empty());
    assert!(fix.set.is_empty());
}

#[test]
fn lookalike_and_elsewhere_mount_paths_are_left_alone() {
    let fix = plan(
        MOUNT,
        vars(&[(
            "LD_LIBRARY_PATH",
            "/tmp/.mountains/lib:/opt/.mount_private/lib:/usr/lib",
        )]),
    );
    assert!(fix.is_empty());
}

#[test]
fn variables_that_never_mention_the_mount_are_untouched() {
    let fix = plan(
        MOUNT,
        vars(&[("HOME", "/home/user"), ("SHELL", "/bin/bash")]),
    );
    assert!(fix.is_empty());
}
