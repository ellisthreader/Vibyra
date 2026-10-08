//! Keep application ACL permissions in sync with the one native command registry:
//! `src/commands/registry.rs` names the parts that `handler()` joins, and each
//! part file under `src/commands/registry/` lists its commands, one per line.
use std::collections::BTreeSet;
#[cfg(not(test))]
use std::{env, fs, path::PathBuf};

const REGISTRY: &str = "src/commands/registry.rs";
const PARTS: &str = "src/commands/registry";

#[cfg(not(test))]
pub fn manifest() -> tauri_build::AppManifest {
    println!("cargo:rerun-if-changed={REGISTRY}");
    println!("cargo:rerun-if-changed={PARTS}");
    let names = command_names(|path| fs::read_to_string(path).ok())
        .expect("Parse explicit native command registry");
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

/// The trimmed, non-comment lines between `open` and the next `]`.
fn lines_after<'a>(source: &'a str, open: &str) -> Result<Vec<&'a str>, &'static str> {
    let (_, body) = source.split_once(open).ok_or("Missing registry list")?;
    let (body, _) = body.split_once(']').ok_or("Unclosed registry list")?;
    Ok(body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("//"))
        .collect())
}

fn is_identifier(part: &str) -> bool {
    !part.is_empty() && part.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
}

/// Every command of every part the registry joins, read through `read`.
fn command_names(read: impl Fn(&str) -> Option<String>) -> Result<Vec<String>, &'static str> {
    let registry = read(REGISTRY).ok_or("Missing command registry")?;
    let mut names = BTreeSet::new();
    for part in lines_after(&registry, "registry_chain![")? {
        if !is_identifier(part) {
            return Err("Unsupported command registry part");
        }
        let source = read(&format!("{PARTS}/{part}.rs")).ok_or("Missing command registry part")?;
        // One list per part, in the macro the registry names: anything else
        // could register a command this parse never sees.
        if source.matches("[$($all)*").count() != 1
            || !source.contains(&format!("macro_rules! {part} {{"))
        {
            return Err("Unsupported command registry part");
        }
        for line in lines_after(&source, "[$($all)*")? {
            let path = line
                .strip_suffix(',')
                .ok_or("Expected one explicit command per line")?;
            if !path.split("::").all(is_identifier) {
                return Err("Unsupported command registry syntax");
            }
            let name = path.rsplit("::").next().ok_or("Missing command name")?;
            if !names.insert(name.to_owned()) {
                return Err("Duplicate command name");
            }
        }
    }
    if names.is_empty() {
        return Err("Empty command registry");
    }
    Ok(names.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::{command_names, PARTS, REGISTRY};
    use std::{collections::HashMap, fs, path::Path};

    /// One registry joining one part whose list is `body`.
    fn registry(body: &str) -> impl Fn(&str) -> Option<String> {
        let files = HashMap::from([
            (
                REGISTRY.to_owned(),
                "registry_chain![\n  listed\n]".to_owned(),
            ),
            (
                format!("{PARTS}/listed.rs"),
                format!("macro_rules! listed {{ [$($all)*\n{body}\n] }}"),
            ),
        ]);
        move |path| files.get(path).cloned()
    }

    #[test]
    fn every_registered_command_gets_an_explicit_permission() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let commands = command_names(|path| fs::read_to_string(root.join(path)).ok()).unwrap();
        for required in [
            "remote_security_decide_device",
            "remote_security_decide_session",
            "remote_security_set_mode",
            "write_terminal",
            "capture_screen_for_editor",
            "take_screenshot_editor_capture",
            "play_voice_cue",
            "agent_v2_select_account",
            "agent_browser_resume",
            "teammate_request_device",
        ] {
            assert!(commands.iter().any(|name| name == required));
        }
    }

    #[test]
    fn ambiguous_or_unrecognized_registries_fail_build_instead_of_widening_access() {
        for body in ["", "a::x,\nb::x,", "wildcard!(),", "a::x"] {
            assert!(command_names(registry(body)).is_err());
        }
        assert!(command_names(registry("a::x,\nb::y,")).is_ok());
        // A part the registry names but the tree lacks, or one macro with two lists.
        assert!(command_names(
            |path| (path == REGISTRY).then(|| "registry_chain![\n  gone\n]".to_owned())
        )
        .is_err());
        let doubled = |path: &str| {
            let list = "macro_rules! listed { [$($all)*\na::x,\n] [$($all)*\nb::y,\n] }";
            match path {
                REGISTRY => Some("registry_chain![\n  listed\n]".to_owned()),
                _ => Some(list.to_owned()),
            }
        };
        assert!(command_names(doubled).is_err());
    }
}
