use std::fs;
use std::path::Path;

use serde_json::{Map, Value};

/// Takes the folder rather than finding it: which `.gemini` this is depends on
/// which account is signing in.
pub fn prepare_gemini_oauth(home: &Path) -> Result<(), String> {
    fs::create_dir_all(home).map_err(|error| error.to_string())?;
    let path = home.join("settings.json");
    let mut value = read_json_or_object(&path)?;
    configure_oauth(&mut value)?;
    write_private_json(&path, &value)
}

fn configure_oauth(value: &mut Value) -> Result<(), String> {
    let security = ensure_object(value, "security")?;
    let auth = security
        .entry("auth")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| "Gemini settings security.auth must be a JSON object.".to_string())?;
    auth.insert(
        "selectedType".into(),
        Value::String("oauth-personal".into()),
    );
    auth.insert("useExternal".into(), Value::Bool(true));
    Ok(())
}

pub fn disconnect_gemini(home: &Path) -> Result<(), String> {
    let path = home.join("settings.json");
    let settings_result = clear_oauth_settings(&path);
    remove_if_present(&home.join("oauth_creds.json"))?;
    settings_result
}

fn read_json_or_object(path: &Path) -> Result<Value, String> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Gemini settings contain invalid JSON.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Value::Object(Map::new())),
        Err(error) => Err(format!("Could not read Gemini settings: {error}")),
    }
}

fn ensure_object<'a>(
    parent: &'a mut Value,
    key: &str,
) -> Result<&'a mut Map<String, Value>, String> {
    let root = parent
        .as_object_mut()
        .ok_or_else(|| "Gemini settings must contain a JSON object.".to_string())?;
    root.entry(key)
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or_else(|| format!("Gemini settings {key} must be a JSON object."))
}

fn clear_oauth_settings(path: &Path) -> Result<(), String> {
    let Some(mut value) = fs::read(path)
        .map(Some)
        .or_else(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                Ok(None)
            } else {
                Err(format!("Could not read Gemini settings: {error}"))
            }
        })?
        .map(|bytes| {
            serde_json::from_slice::<Value>(&bytes)
                .map_err(|_| "Gemini settings contain invalid JSON.".to_string())
        })
        .transpose()?
    else {
        return Ok(());
    };
    if let Some(auth) = value
        .pointer_mut("/security/auth")
        .and_then(Value::as_object_mut)
    {
        auth.remove("selectedType");
        auth.remove("useExternal");
    }
    write_private_json(path, &value)
}

fn remove_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not remove Gemini credentials: {error}")),
    }
}

fn write_private_json(path: &Path, value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{configure_oauth, ensure_object};
    use serde_json::{json, Value};

    #[test]
    fn preserves_existing_settings_while_adding_objects() {
        let mut value = json!({ "theme": "dark" });
        ensure_object(&mut value, "security").unwrap();
        assert_eq!(value.get("theme"), Some(&Value::String("dark".into())));
        assert!(value.get("security").is_some_and(Value::is_object));
    }

    #[test]
    fn rejects_non_object_settings_without_panicking() {
        let mut value = json!([]);
        assert!(configure_oauth(&mut value).is_err());
        assert_eq!(value, json!([]));
    }

    #[test]
    fn rejects_non_object_auth_without_overwriting_it() {
        let mut value = json!({ "security": { "auth": "invalid" } });
        assert!(configure_oauth(&mut value).is_err());
        assert_eq!(value.pointer("/security/auth"), Some(&json!("invalid")));
    }
}
