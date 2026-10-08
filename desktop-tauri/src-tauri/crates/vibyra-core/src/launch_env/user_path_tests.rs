use super::{extract, merge, merge_for};
use crate::launch_env::{END, START};

fn extras(dirs: &[&str]) -> Vec<String> {
    dirs.iter().map(|dir| (*dir).to_owned()).collect()
}

#[test]
fn the_users_shell_path_leads_and_the_mount_follows() {
    // The real shape on a desktop launch: the process PATH starts with the
    // AppImage mount, and only the shell knows about ~/.npm-global/bin.
    let merged = merge_for(
        false,
        "/tmp/.mount_Vib/usr/bin:/usr/bin:/bin",
        "/home/u/.npm-global/bin:/usr/bin:/bin",
        &extras(&["/home/u/.local/bin"]),
    );
    assert_eq!(
        merged,
        "/home/u/.npm-global/bin:/usr/bin:/bin:/tmp/.mount_Vib/usr/bin:/home/u/.local/bin"
    );
}

#[test]
fn duplicate_and_trailing_slash_entries_collapse() {
    // ~/.bashrc exporting the same dir twice is common and must not double it.
    let merged = merge_for(
        false,
        "/usr/bin/:/usr/bin",
        "/home/u/.npm-global/bin:/home/u/.npm-global/bin/",
        &extras(&["/usr/bin"]),
    );
    assert_eq!(merged, "/home/u/.npm-global/bin:/usr/bin");
}

#[test]
fn merging_is_idempotent_so_a_second_install_is_a_no_op() {
    let once = merge_for(
        false,
        "/usr/bin",
        "/home/u/.npm-global/bin",
        &extras(&["/snap/bin"]),
    );
    let twice = merge_for(
        false,
        &once,
        "/home/u/.npm-global/bin",
        &extras(&["/snap/bin"]),
    );
    assert_eq!(once, twice);
}

#[test]
fn a_failed_probe_still_yields_the_inherited_path_plus_extras() {
    let merged = merge_for(
        false,
        "/usr/bin:/bin",
        "",
        &extras(&["/home/u/.npm-global/bin"]),
    );
    assert_eq!(merged, "/usr/bin:/bin:/home/u/.npm-global/bin");
}

#[test]
fn empty_segments_never_become_the_current_directory() {
    // A literal empty PATH entry means "." to execvp — a real hazard.
    assert_eq!(merge_for(false, "/usr/bin::", ":", &[]), "/usr/bin");
}

#[test]
fn the_path_is_read_out_of_noisy_shell_output() {
    let output = format!(
        "bash: cannot set terminal process group\n{START}/home/u/.npm-global/bin:/usr/bin{END}"
    );
    assert_eq!(extract(&output), Some("/home/u/.npm-global/bin:/usr/bin"));
}

#[test]
fn output_without_complete_markers_is_rejected() {
    assert_eq!(extract("no markers here"), None);
    assert_eq!(extract(&format!("{START}/usr/bin")), None);
    assert_eq!(extract(&format!("{START}   {END}")), None);
}

#[test]
fn windows_drive_letters_and_semicolons_survive_tool_path_refresh() {
    let current = r"C:\Windows\System32;C:\Program Files\nodejs;C:\Users\u\bin";
    let result = merge_for(
        true,
        current,
        r"c:\program files\nodejs\;D:\Tools",
        &extras(&[r"C:\Users\u\bin\"]),
    );
    assert_eq!(
        result,
        r"c:\program files\nodejs;D:\Tools;C:\Windows\System32;C:\Users\u\bin"
    );
    assert_eq!(merge_for(true, &result, "", &[]), result);
}

#[test]
fn windows_drive_root_stays_absolute_and_empty_entries_are_dropped() {
    assert_eq!(merge_for(true, r"C:\;;D:/;", "", &[]), r"C:\;D:/");
}

#[test]
fn windows_quoted_semicolons_stay_inside_distinct_directories() {
    let current = r#""C:\Tools;one";"D:\Other;one";C:\Windows"#;
    assert_eq!(merge_for(true, current, "", &[]), current);
}

#[test]
fn native_merge_preserves_each_inherited_directory() {
    let directory = tempfile::tempdir().unwrap();
    let first = directory.path().join("Tools; one");
    let second = directory.path().join("Other; one");
    std::fs::create_dir(&first).unwrap();
    std::fs::create_dir(&second).unwrap();
    let root = directory.path().ancestors().last().unwrap();
    let expected = vec![root.to_path_buf(), first, second];
    assert!(expected.iter().all(|path| path.is_dir()));
    let native = std::env::join_paths(&expected).unwrap();
    let result = merge(native.to_str().unwrap(), "", &[]);
    assert_eq!(std::env::split_paths(&result).collect::<Vec<_>>(), expected);
}
