use super::{extract, merge};
use crate::launch_env::{END, START};

fn extras(dirs: &[&str]) -> Vec<String> {
    dirs.iter().map(|dir| (*dir).to_owned()).collect()
}

#[test]
fn the_users_shell_path_leads_and_the_mount_follows() {
    // The real shape on a desktop launch: the process PATH starts with the
    // AppImage mount, and only the shell knows about ~/.npm-global/bin.
    let merged = merge(
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
    let merged = merge(
        "/usr/bin/:/usr/bin",
        "/home/u/.npm-global/bin:/home/u/.npm-global/bin/",
        &extras(&["/usr/bin"]),
    );
    assert_eq!(merged, "/home/u/.npm-global/bin:/usr/bin");
}

#[test]
fn merging_is_idempotent_so_a_second_install_is_a_no_op() {
    let once = merge(
        "/usr/bin",
        "/home/u/.npm-global/bin",
        &extras(&["/snap/bin"]),
    );
    let twice = merge(&once, "/home/u/.npm-global/bin", &extras(&["/snap/bin"]));
    assert_eq!(once, twice);
}

#[test]
fn a_failed_probe_still_yields_the_inherited_path_plus_extras() {
    let merged = merge("/usr/bin:/bin", "", &extras(&["/home/u/.npm-global/bin"]));
    assert_eq!(merged, "/usr/bin:/bin:/home/u/.npm-global/bin");
}

#[test]
fn empty_segments_never_become_the_current_directory() {
    // A literal empty PATH entry means "." to execvp — a real hazard.
    assert_eq!(merge("/usr/bin::", ":", &[]), "/usr/bin");
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
