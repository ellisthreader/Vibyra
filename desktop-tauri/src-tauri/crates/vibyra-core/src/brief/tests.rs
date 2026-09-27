use std::path::Path;

use crate::fsx::git_changes::ChangedFile;

use super::budget::{assemble, section, TOTAL_CHARS};
use super::changes::render;
use super::{build, BriefInput, Shape};

const MARKER: &str = "…[trimmed by Vibyra]";

fn count(text: &str, fill: char) -> usize {
    text.chars().filter(|character| *character == fill).count()
}

fn changed(status: &str, path: &str) -> ChangedFile {
    ChangedFile {
        path: path.to_string(),
        status: status.to_string(),
        previous_path: None,
    }
}

fn input(root: &Path) -> BriefInput<'_> {
    BriefInput {
        name: "Applications",
        root,
        terminals: Vec::new(),
        memory: None,
    }
}

#[test]
fn every_section_is_held_to_its_cap_and_the_join_to_the_total() {
    let (text, truncated) = assemble(vec![
        section("identity", "q".repeat(2_000), 260, 0),
        section("stack", "w".repeat(2_000), 300, 0),
        section("scripts", "z".repeat(2_000), 260, 0),
        section("layout", "x".repeat(2_000), 380, 0),
        section("git", "g".repeat(2_000), 700, 1),
        section("terminals", "k".repeat(2_000), 300, 0),
        section("memory", "j".repeat(2_000), 800, 2),
    ]);
    assert!(text.len() <= TOTAL_CHARS, "brief ran to {}", text.len());
    assert_eq!(truncated.len(), 7);
    for (fill, cap) in [('q', 260), ('w', 300), ('z', 260), ('x', 380), ('k', 300)] {
        let kept = count(&text, fill);
        assert!(kept <= cap, "{fill} ran to {kept}");
        assert!(kept + 40 > cap, "{fill} was cut back to {kept}");
    }
}

#[test]
fn slack_grows_the_elastic_sections_in_order_and_never_past_the_total() {
    let (text, _) = assemble(vec![
        section("identity", "q".repeat(50), 260, 0),
        section("git", "g".repeat(5_000), 700, 1),
        section("memory", "j".repeat(5_000), 800, 2),
    ]);
    assert!(text.len() <= TOTAL_CHARS, "brief ran to {}", text.len());
    assert_eq!(count(&text, 'q'), 50, "a fixed section must not grow");
    assert!(count(&text, 'j') > 2_000, "memory takes the slack first");
    assert!(
        count(&text, 'g') < 700,
        "git keeps its own cap once slack is gone"
    );
}

#[test]
fn a_truncated_section_is_named_and_carries_the_marker() {
    let (text, truncated) = assemble(vec![section("layout", "x".repeat(900), 380, 0)]);
    assert_eq!(truncated, vec!["layout".to_string()]);
    assert!(text.ends_with(MARKER));
    assert!(text.len() <= 380);
}

#[test]
fn truncation_never_splits_a_multibyte_character() {
    let (text, _) = assemble(vec![section("memory", "é".repeat(400), 300, 0)]);
    assert!(text.len() <= 300);
    assert!(text.ends_with(MARKER));
    let body = text.trim_end_matches(MARKER).trim_end();
    assert!(body.chars().all(|character| character == 'é'));
    assert!(body.len() >= 300 - MARKER.len() - 4);
}

#[test]
fn an_empty_section_leaves_no_header_behind() {
    let (text, truncated) = assemble(vec![
        section(
            "identity",
            "Project: Studio at /Studio.".to_string(),
            260,
            0,
        ),
        section("memory", String::new(), 800, 2),
        section("terminals", "   ".to_string(), 300, 0),
    ]);
    assert_eq!(text, "Project: Studio at /Studio.");
    assert!(truncated.is_empty());
}

#[test]
fn four_hundred_changes_report_exact_counts_and_a_dozen_paths() {
    let mut files = Vec::new();
    for index in 0..400 {
        let status = match index {
            0..=2 => "UU",
            3..=7 => "M ",
            8..=299 => " M",
            _ => "??",
        };
        let path = match index {
            5 => "top.rs".to_string(),
            _ => format!("src/area{index:03}/file{index:03}.rs"),
        };
        files.push(changed(status, &path));
    }
    let listing = render(&files);
    files.reverse();
    assert_eq!(listing, render(&files));
    let counts =
        "Working tree: 400 changed files — 3 conflicted, 5 staged, 292 modified, 100 untracked.";
    assert!(listing.starts_with(counts), "{listing}");
    // Shallowest path first inside a bucket, then alphabetical.
    assert!(listing.contains("\nStaged: top.rs, src/area003/file003.rs, src/area004/file004.rs,"));
    assert!(listing.contains("\nConflicted: src/area000/file000.rs, src/area001/file001.rs,"));
    assert!(listing.ends_with("…388 more not listed."));
    let listed: usize = listing
        .lines()
        .skip(1)
        .filter(|line| !line.starts_with('…'))
        .map(|line| line.split(", ").count())
        .sum();
    assert_eq!(listed, 12);
}

#[test]
fn a_very_long_path_keeps_both_of_its_ends() {
    let long = format!("src/{}/end-of-a-very-long-name.rs", "deep".repeat(30));
    let listing = render(&[changed(" M", &long)]);
    assert!(listing.contains("src/deepdeep"));
    assert!(listing.contains("end-of-a-very-long-name.rs"));
    assert!(!listing.contains(&long), "the whole path was listed");
}

#[test]
fn an_empty_folder_is_not_described_as_a_project() {
    let temp = tempfile::tempdir().unwrap();
    let brief = build(&input(temp.path()));
    assert_eq!(brief.shape, Shape::Plain);
    assert!(!brief.codebase);
    assert!(brief.text.contains("not a code project"), "{}", brief.text);
    assert!(brief.text.contains("Its top level is 0 entries."));
    assert!(!brief.text.contains("Branch"));
    assert_eq!(brief.chars, brief.text.len());
}

#[test]
fn a_package_json_folder_names_its_script_keys_and_no_bodies() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::write(
        temp.path().join("package.json"),
        r#"{"scripts":{"verify":"node scripts/secret-check.mjs","lines":"node count.mjs","app:dev":"tauri dev"}}"#,
    )
    .unwrap();
    let brief = build(&input(temp.path()));
    assert_eq!(brief.shape, Shape::Folder);
    assert!(brief.codebase);
    for key in ["verify", "lines", "app:dev"] {
        assert!(brief.text.contains(key), "lost {key} in {}", brief.text);
    }
    for body in ["secret-check", "count.mjs", "tauri dev"] {
        assert!(!brief.text.contains(body), "leaked {body}");
    }
    assert!(brief.text.contains("not a Git repository"));
}

#[test]
fn a_repository_reports_its_working_tree_and_admits_it_knows_no_commands() {
    let temp = tempfile::tempdir().unwrap();
    let init = std::process::Command::new("git")
        .arg("-C")
        .arg(temp.path())
        .args(["init", "-q"])
        .status()
        .unwrap();
    assert!(init.success());
    std::fs::write(temp.path().join("notes.txt"), "hello").unwrap();

    let brief = build(&input(temp.path()));
    let text = brief.text.as_str();
    assert_eq!(brief.shape, Shape::Repository);
    let counts = "Working tree: 1 changed file — 0 conflicted, 0 staged, 0 modified, 1 untracked.";
    assert!(text.contains(counts), "{text}");
    assert!(text.contains("Do not assume a build or test command; ask."));
    assert!(text.contains("Top level (1 entry): notes.txt."));
}
