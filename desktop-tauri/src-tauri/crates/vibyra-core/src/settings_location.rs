use super::Settings;
use std::path::PathBuf;

impl Settings {
    pub fn default_path() -> PathBuf {
        // A loopback development server can run beside an installed Vibyra app
        // without opening its settings, phone identity, or Agent Computer grants.
        let local_api = std::env::var("VIBYRA_DESKTOP_API_URL")
            .ok()
            .is_some_and(|url| {
                url.starts_with("http://127.0.0.1:") || url.starts_with("http://localhost:")
            });
        if local_api {
            if let Some(path) = std::env::var_os("VIBYRA_DESKTOP_STATE_DIR") {
                let path = PathBuf::from(path);
                if path.is_absolute() {
                    return path.join("settings.json");
                }
            }
            return dirs::config_dir()
                .unwrap_or_else(std::env::temp_dir)
                .join("vibyra-desktop-dev")
                .join("settings.json");
        }
        dirs::config_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("vibyra-desktop")
            .join("settings.json")
    }
}
