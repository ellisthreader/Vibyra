//! Rails, Flutter web and Go servers, recognised like the stacks in stacks.rs.

use std::path::Path;

use super::stacks::{probe, target};
use super::types::{DetectedTarget, PreviewDeviceHint, ProjectKind};

pub(super) fn rails(app: &Path, relative: &str) -> Option<DetectedTarget> {
    (app.join("bin/rails").is_file() && app.join("Gemfile").is_file()).then(|| {
        let args = ["server", "-b", "127.0.0.1", "-p", "{port}"];
        target(
            app,
            relative,
            "Rails",
            app.join("bin/rails").to_string_lossy().into_owned(),
            &args,
            ProjectKind::Website,
            &[],
        )
    })
}

pub(super) fn flutter(app: &Path, relative: &str) -> Option<DetectedTarget> {
    let text = probe(&app.join("pubspec.yaml"))?;
    (text.contains("flutter:") && app.join("web").is_dir()).then(|| {
        let args = [
            "run",
            "-d",
            "web-server",
            "--web-hostname",
            "127.0.0.1",
            "--web-port",
            "{port}",
        ];
        let mut found = target(
            app,
            relative,
            "Flutter web",
            "flutter".into(),
            &args,
            ProjectKind::Mobile,
            &[],
        );
        found.target.device_hint = PreviewDeviceHint::Phone;
        found
    })
}

/// A Go program that serves HTTP, judged by what its entry file imports.
pub(super) fn go_server(app: &Path, relative: &str) -> Option<DetectedTarget> {
    app.join("go.mod").is_file().then_some(())?;
    let text = probe(&app.join("main.go"))?;
    let serves = [
        "net/http",
        "gin-gonic/gin",
        "labstack/echo",
        "gofiber/fiber",
        "go-chi/chi",
    ];
    serves.iter().any(|name| text.contains(name)).then(|| {
        let env = [("PORT", "{port}"), ("HOST", "127.0.0.1")];
        target(
            app,
            relative,
            "Go server",
            "go".into(),
            &["run", "."],
            ProjectKind::Api,
            &env,
        )
    })
}
