//! Lines that look like reads and are not.
//!
//! Each of these was classified `Read` — and so allowed with no card — before
//! `read_only` learned to refuse anything that can run a command its first
//! word does not name. A false "write" here costs one card; the old answer
//! cost the user the one guarantee the queue exists to give.

use super::*;

#[test]
fn a_listing_tool_that_executes_is_not_a_read() {
    for line in [
        "find . -name '*.py' -exec rm -rf {} +",
        "find /home/u/proj -name x -delete",
        "find . -type f -execdir sh -c 'echo {}' \\;",
        "find . -name '*.log' -ok rm {} \\;",
        "ls | xargs rm",
    ] {
        assert_ne!(bash_risk(line), Risk::Read, "{line}");
    }
}

#[test]
fn substitution_and_backgrounding_hide_a_second_command() {
    for line in [
        "echo $(rm -rf /home/u/x)",
        "echo `rm -rf /home/u/x`",
        "cat <(rm -rf /home/u/x)",
        "echo hi & rm -rf /home/u/x",
        "true || rm -rf /home/u/x",
        "awk 'BEGIN{system(\"rm -rf /home/u/x\")}'",
        "echo ok; eval \"$cmd\"",
        "sh -c 'rm -rf /home/u/x'",
        "python -c 'import shutil; shutil.rmtree(\"x\")'",
        "sudo cat /etc/shadow",
    ] {
        assert_ne!(bash_risk(line), Risk::Read, "{line}");
    }
}

#[test]
fn another_processes_argv_or_environment_is_a_secret() {
    assert_eq!(bash_risk("cat /proc/self/cmdline"), Risk::Secret);
    assert_eq!(bash_risk("cat /proc/1234/environ"), Risk::Secret);
}

/// The honest reads still read: the change must not turn every `ls` into a
/// card, or people learn to click yes.
#[test]
fn plain_reads_are_still_reads() {
    for line in [
        "ls -la",
        "cat src/main.rs | head -50",
        "grep -rn 'fn main' src && wc -l src/main.rs",
        "git status; git diff --stat",
        "find . -name '*.rs' -newer Cargo.toml",
        "echo done",
    ] {
        assert_eq!(bash_risk(line), Risk::Read, "{line}");
    }
}
