use std::collections::HashMap;

use crate::agents::program_in_path;

/// Which of these executables the user actually has. Tool ids are the
/// executable name; Rails also needs a real version rather than the macOS shim. The stack
/// step disables the rows whose tools are missing rather than letting a run
/// fail halfway through.
pub fn installed_tools(tools: &[String]) -> HashMap<String, bool> {
    tools
        .iter()
        .map(|tool| {
            (
                tool.clone(),
                program_in_path(tool) && (tool != "rails" || rails_installed()),
            )
        })
        .collect()
}

// macOS ships a /usr/bin/rails placeholder that exits0 but cannot create apps.
fn rails_installed() -> bool {
    use std::{
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    let mut command = Command::new(crate::launch_env::resolve_program("rails"));
    command
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    crate::launch_env::sanitize_command(&mut command);
    let Ok(mut child) = command.spawn() else {
        return false;
    };
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return status.success()
                    && child.wait_with_output().ok().is_some_and(|out| {
                        real_rails_version(&String::from_utf8_lossy(&out.stdout))
                    })
            }
            Ok(None) if start.elapsed() < Duration::from_secs(3) => {
                std::thread::sleep(Duration::from_millis(20))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return false;
            }
        }
    }
}
fn real_rails_version(output: &str) -> bool {
    output.lines().any(|line| {
        line.strip_prefix("Rails ")
            .is_some_and(|version| version.chars().next().is_some_and(|c| c.is_ascii_digit()))
    })
}
#[cfg(test)]
mod tests {
    use super::real_rails_version;
    #[test]
    fn macos_placeholder_is_not_a_rails_toolchain() {
        assert!(!real_rails_version(
            "Rails is not currently installed on this system."
        ));
        assert!(real_rails_version("Rails 8.0.2\n"));
    }
}
