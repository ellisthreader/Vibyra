use std::path::Path;

use crate::CoreResult;

use super::bounded_text::read_manifest;
use super::install::{composer_install, missing_node_modules, node_install, resolve_manager};
use super::package_companion::vite_companion;
use super::process::preview_command;
use super::target::runnable_target;
use super::types::{DetectedTarget, LaunchRecipe, PreviewDeviceHint, ProcessSpec, TargetInfo};

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
    let install = laravel_install(root, processes.len() > 1);
    let suffix = if processes.len() > 1 {
        " + npm run dev -- --host 127.0.0.1 --port=<available> --base /__vibyra_vite/"
    } else {
        ""
    };
    let mut target = runnable_target(
        relative,
        "laravel",
        "Laravel",
        PreviewDeviceHint::Laptop,
        false,
        format!("php artisan serve --host=127.0.0.1 --port=<available>{suffix}"),
        LaunchRecipe::Processes {
            processes,
            primary_index: 0,
            install: install.clone(),
        },
    );
    target.info = TargetInfo {
        needs_install: !install.is_empty(),
        install_command: (!install.is_empty()).then(|| {
            install
                .iter()
                .map(preview_command)
                .collect::<Vec<_>>()
                .join(" && ")
        }),
        ..TargetInfo::default()
    };
    Ok(Some(target))
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

/// Composer for `vendor/`, and the package manager for the node_modules of the Vite companion.
fn laravel_install(root: &Path, with_vite: bool) -> Vec<ProcessSpec> {
    let mut install: Vec<ProcessSpec> = composer_install(root).into_iter().collect();
    if with_vite && missing_node_modules(root, root, "vite", true) {
        let (manager, workspace) = resolve_manager(root, root, None);
        install.push(node_install(manager, &workspace));
    }
    install
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
            install: Vec::new(),
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
