//! Projects that are not Node: Python web frameworks, Rails, Go servers and
//! Flutter web. Each is recognised from files the stack always has, and runs
//! on a port Preview chooses, so a run needs no configuration.

use std::path::Path;

use super::bounded_text::read_manifest;
use super::process::preview_command;
use super::stacks_other::{flutter, go_server, rails};
use super::target::runnable_target;
use super::types::{
    DetectedTarget, LaunchRecipe, PreviewDeviceHint, ProcessSpec, ProjectKind, TargetInfo,
};

const MAX_PROBE_BYTES: u64 = 64 * 1024;

pub(crate) fn detect_stack(app: &Path, relative: &str) -> Option<DetectedTarget> {
    django(app, relative)
        .or_else(|| python_app(app, relative))
        .or_else(|| rails(app, relative))
        .or_else(|| flutter(app, relative))
        .or_else(|| go_server(app, relative))
}

/// The project's own interpreter when it has a virtualenv, so its installed
/// packages are the ones used.
pub(crate) fn python(app: &Path) -> String {
    [
        ".venv/bin/python",
        "venv/bin/python",
        ".venv/Scripts/python.exe",
        "venv/Scripts/python.exe",
    ]
    .iter()
    .map(|path| app.join(path))
    .find(|path| path.is_file())
    .map_or_else(
        || "python3".into(),
        |path| path.to_string_lossy().into_owned(),
    )
}

fn django(app: &Path, relative: &str) -> Option<DetectedTarget> {
    app.join("manage.py").is_file().then(|| {
        let args = ["manage.py", "runserver", "127.0.0.1:{port}", "--noreload"];
        target(
            app,
            relative,
            "Django",
            python(app),
            &args,
            ProjectKind::Website,
            &[],
        )
    })
}

/// Flask and FastAPI apps are found by their constructor call in a conventional entry file.
fn python_app(app: &Path, relative: &str) -> Option<DetectedTarget> {
    for entry in ["app.py", "main.py", "server.py", "wsgi.py", "api.py"] {
        let Some(text) = probe(&app.join(entry)) else {
            continue;
        };
        let module = entry.trim_end_matches(".py");
        if text.contains("FastAPI(") {
            let args = [
                "-m",
                "uvicorn",
                &format!("{module}:app"),
                "--host",
                "127.0.0.1",
                "--port",
                "{port}",
            ];
            return Some(target(
                app,
                relative,
                "FastAPI",
                python(app),
                &args,
                ProjectKind::Api,
                &[],
            ));
        }
        if text.contains("Flask(") {
            let args = [
                "-m",
                "flask",
                "--app",
                module,
                "run",
                "--host",
                "127.0.0.1",
                "--port",
                "{port}",
                "--no-reload",
            ];
            return Some(target(
                app,
                relative,
                "Flask",
                python(app),
                &args,
                ProjectKind::Website,
                &[],
            ));
        }
    }
    None
}

pub(super) fn probe(path: &Path) -> Option<String> {
    let len = path.metadata().ok()?.len();
    if len > MAX_PROBE_BYTES * 16 {
        return None;
    }
    read_manifest(path, "source file").ok().flatten()
}

pub(super) fn target(
    app: &Path,
    relative: &str,
    framework: &str,
    program: String,
    args: &[&str],
    kind: ProjectKind,
    env: &[(&str, &str)],
) -> DetectedTarget {
    let process = ProcessSpec {
        label: framework.into(),
        program,
        args: args.iter().map(|arg| (*arg).to_owned()).collect(),
        env: env
            .iter()
            .map(|(k, v)| ((*k).into(), (*v).into()))
            .collect(),
        cwd: app.to_owned(),
    };
    let display = preview_command(&process);
    let mut found = runnable_target(
        relative,
        &framework.to_ascii_lowercase().replace(' ', "-"),
        framework,
        PreviewDeviceHint::Laptop,
        false,
        display,
        LaunchRecipe::Processes {
            processes: vec![process],
            primary_index: 0,
            install: Vec::new(),
        },
    );
    found.info = TargetInfo {
        project: kind,
        ..TargetInfo::default()
    };
    found
}
