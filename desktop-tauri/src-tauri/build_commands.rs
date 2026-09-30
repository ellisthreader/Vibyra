//! Keep application ACL permissions in sync with the one native command registry.
use std::collections::BTreeSet;
#[cfg(not(test))]
use std::{env, fs, path::PathBuf};

#[cfg(not(test))]
pub fn manifest() -> tauri_build::AppManifest {
    println!("cargo:rerun-if-changed=src/commands/registry.rs");
    let source = fs::read_to_string("src/commands/registry.rs").expect("Read command registry");
    let names = command_names(&source).expect("Parse explicit native command registry");
    // The build process exits after this manifest has been consumed.
    let commands: &'static [&'static str] = Box::leak(
        names
            .iter()
            .cloned()
            .map(|name| &*Box::leak(name.into_boxed_str()))
            .collect::<Vec<_>>()
            .into_boxed_slice(),
    );
    let directory = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("application-permissions");
    fs::create_dir_all(&directory).expect("Create application permission directory");
    let permissions = names
        .iter()
        .map(|name| format!("\"allow-{}\"", name.replace('_', "-")))
        .collect::<Vec<_>>()
        .join(",\n");
    fs::write(directory.join("default.toml"), format!(
        "[default]\ndescription = \"Bundled main-window application commands\"\npermissions = [\n{permissions}\n]\n"
    )).expect("Write explicit application permissions");
    let pattern = Box::leak(
        directory
            .join("*.toml")
            .to_string_lossy()
            .into_owned()
            .into_boxed_str(),
    );
    tauri_build::AppManifest::new()
        .commands(commands)
        .permissions_path_pattern(pattern)
}

fn command_names(source: &str) -> Result<Vec<String>, &'static str> {
    let (_, body) = source
        .split_once("tauri::generate_handler![")
        .ok_or("Missing handler")?;
    let (body, _) = body.split_once(']').ok_or("Unclosed handler")?;
    let mut names = BTreeSet::new();
    for line in body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("//"))
    {
        let path = line
            .strip_suffix(',')
            .ok_or("Expected one explicit command per line")?;
        if !path.split("::").all(|part| {
            !part.is_empty() && part.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
        }) {
            return Err("Unsupported command registry syntax");
        }
        let name = path.rsplit("::").next().ok_or("Missing command name")?;
        if !names.insert(name.to_owned()) {
            return Err("Duplicate command name");
        }
    }
    if names.is_empty() {
        return Err("Empty command registry");
    }
    Ok(names.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::command_names;

    #[test]
    fn every_registered_command_gets_an_explicit_permission() {
        let commands = command_names(include_str!("src/commands/registry.rs")).unwrap();
        for required in [
            "remote_security_decide_device",
            "remote_security_decide_session",
            "remote_security_set_mode",
            "write_terminal",
            "capture_screen_for_editor",
            "take_screenshot_editor_capture",
            "play_voice_cue",
        ] {
            assert!(commands.iter().any(|name| name == required));
        }
    }

    #[test]
    fn ambiguous_or_unrecognized_registries_fail_build_instead_of_widening_access() {
        for body in ["", "a::x,\nb::x,", "wildcard!(),", "a::x"] {
            assert!(command_names(&format!("tauri::generate_handler![{body}]")).is_err());
        }
    }
}
