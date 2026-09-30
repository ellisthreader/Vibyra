//! Real PTY fixture shell: native Windows command processor or Unix sh.
use vibyra_core::pty::LaunchSpec;

pub(super) fn waiting() -> LaunchSpec {
    let (program, args) = if cfg!(windows) {
        (
            "cmd.exe",
            vec!["/D", "/Q", "/C", "echo READY & set /p line="],
        )
    } else {
        ("/bin/sh", vec!["-c", "echo READY; read line"])
    };
    LaunchSpec {
        program: program.into(),
        args: args.into_iter().map(str::to_owned).collect(),
        env: vec![],
        env_remove: vec![],
        cwd: None,
        rows: 30,
        cols: 100,
    }
}
