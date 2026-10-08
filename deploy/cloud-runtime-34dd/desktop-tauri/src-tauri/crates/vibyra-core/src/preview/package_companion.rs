//! The Vite dev server that runs beside a Laravel app.

use std::path::Path;

use crate::CoreResult;

use super::bounded_text::read_manifest;
use super::package_profile::{
    manager_args, matches_framework_script, package_manager, safe_script, string_map,
};
use super::types::ProcessSpec;

pub(crate) fn vite_companion(root: &Path) -> CoreResult<Option<ProcessSpec>> {
    let Some(text) = read_manifest(&root.join("package.json"), "package.json")? else {
        return Ok(None);
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Ok(None);
    };
    let scripts = string_map(value.get("scripts"));
    let Some(body) = scripts.get("dev") else {
        return Ok(None);
    };
    if !safe_script(body) || !matches_framework_script("Vite", body) {
        return Ok(None);
    }
    let manager = package_manager(root);
    let mut args = manager_args(manager, "dev");
    args.extend([
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        "{port}".into(),
        "--base".into(),
        "/__vibyra_vite/".into(),
    ]);
    Ok(Some(ProcessSpec {
        label: "Vite".into(),
        program: manager.into(),
        args,
        env: Vec::new(),
        cwd: root.to_owned(),
    }))
}
