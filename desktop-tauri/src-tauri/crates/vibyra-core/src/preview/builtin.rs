use std::path::Path;

use crate::CoreResult;

use super::bounded_text::read_manifest;
use super::package::vite_companion;
use super::target::runnable_target;
use super::types::{DetectedTarget, LaunchRecipe, PreviewDeviceHint, ProcessSpec};

const STATIC_ENTRIES: [&str; 8] = [
    "dist/index.html",
    "build/index.html",
    "build/web/index.html",
    "out/index.html",
    ".output/public/index.html",
    "public/index.html",
    "www/index.html",
    "index.html",
];

pub(crate) fn detect_laravel(root: &Path, relative: &str) -> CoreResult<Option<DetectedTarget>> {
    if !root.join("artisan").is_file() || !laravel_project(root)? {
        return Ok(None);
    }
    let mut processes = vec![ProcessSpec {
        label: "Laravel".into(),
        program: "php".into(),
        args: vec![
            "artisan".into(),
            "serve".into(),
            "--host=127.0.0.1".into(),
            "--port={port}".into(),
        ],
        env: Vec::new(),
        cwd: root.to_owned(),
    }];
    if let Some(vite) = vite_companion(root)? {
        processes.push(vite);
    }
    let suffix = if processes.len() > 1 {
        " + npm run dev"
    } else {
        ""
    };
    Ok(Some(runnable_target(
        relative,
        "laravel",
        "Laravel",
        PreviewDeviceHint::Laptop,
        false,
        format!("php artisan serve --host=127.0.0.1 --port=<available>{suffix}"),
        LaunchRecipe::Processes {
            processes,
            primary_index: 0,
        },
    )))
}

pub(crate) fn detect_static_or_php(root: &Path, relative: &str) -> Option<DetectedTarget> {
    for entry in STATIC_ENTRIES {
        let path = root.join(entry);
        if path.is_file() {
            let static_root = path.parent().unwrap_or(root).to_owned();
            return Some(runnable_target(
                relative,
                "static",
                "Static website",
                PreviewDeviceHint::Laptop,
                false,
                format!(
                    "Serve {}",
                    path.file_name().unwrap_or_default().to_string_lossy()
                ),
                LaunchRecipe::Static {
                    root: static_root,
                    entry: path,
                },
            ));
        }
    }
    root.join("index.php")
        .is_file()
        .then(|| php_target(root, relative))
}

fn laravel_project(root: &Path) -> CoreResult<bool> {
    Ok(read_manifest(&root.join("composer.json"), "composer.json")?
        .is_some_and(|text| text.contains("laravel/framework")))
}

fn php_target(root: &Path, relative: &str) -> DetectedTarget {
    runnable_target(
        relative,
        "php",
        "PHP",
        PreviewDeviceHint::Laptop,
        false,
        "php -S 127.0.0.1:<available> -t .".into(),
        LaunchRecipe::Processes {
            processes: vec![ProcessSpec {
                label: "PHP".into(),
                program: "php".into(),
                args: vec![
                    "-S".into(),
                    "127.0.0.1:{port}".into(),
                    "-t".into(),
                    ".".into(),
                ],
                env: Vec::new(),
                cwd: root.to_owned(),
            }],
            primary_index: 0,
        },
    )
}
