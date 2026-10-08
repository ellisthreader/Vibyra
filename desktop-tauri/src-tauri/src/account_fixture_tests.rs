//! Explicit native shells for real PTY fixtures, never an ambient shell fallback.
pub fn shell() -> vibyra_core::pty::LaunchSpec {
    #[cfg(windows)]
    let program =
        std::path::PathBuf::from(std::env::var_os("SystemRoot").expect("Windows system root"))
            .join("System32")
            .join("cmd.exe")
            .to_string_lossy()
            .into_owned();
    #[cfg(not(windows))]
    let program = "/bin/sh".to_owned();
    let mut spec = vibyra_core::pty::LaunchSpec::shell(Some(program), None);
    #[cfg(windows)]
    {
        spec.args = vec!["/D".into(), "/Q".into()];
    }
    #[cfg(not(windows))]
    {
        spec.args = vec![];
    }
    spec
}

pub fn input(marker: &str) -> String {
    if cfg!(windows) {
        format!("echo {marker}\r\n")
    } else {
        format!("printf {marker}\n")
    }
}
