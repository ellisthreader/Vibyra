//! Finding and launching the Agent browser: the system Chrome (or Chromium)
//! binary with its own private profile directory, never the person's normal
//! profile, forced through the filtering proxy. One controller per profile.

use std::collections::HashMap;
use std::io::{PipeReader, PipeWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

const MAC_APPS: [&str; 4] = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const PATH_NAMES: [&str; 6] = [
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "microsoft-edge",
    "microsoft-edge-stable",
];
/// Chrome, Chromium and Edge under the Windows install roots, per-machine
/// before per-user.
const WINDOWS_APPS: [(&str, &str); 6] = [
    ("ProgramFiles", "Google\\Chrome\\Application\\chrome.exe"),
    (
        "ProgramFiles(x86)",
        "Google\\Chrome\\Application\\chrome.exe",
    ),
    ("LOCALAPPDATA", "Google\\Chrome\\Application\\chrome.exe"),
    ("LOCALAPPDATA", "Chromium\\Application\\chrome.exe"),
    (
        "ProgramFiles(x86)",
        "Microsoft\\Edge\\Application\\msedge.exe",
    ),
    ("ProgramFiles", "Microsoft\\Edge\\Application\\msedge.exe"),
];

/// A Chromium-family browser on this computer, or `None` (no browser tools then).
pub fn find() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("VIBYRA_AGENT_CHROME").map(PathBuf::from) {
        return path.is_file().then_some(path);
    }
    MAC_APPS
        .iter()
        .map(PathBuf::from)
        .chain(
            WINDOWS_APPS
                .iter()
                .filter(|_| cfg!(windows))
                .filter_map(|(root, rest)| Some(PathBuf::from(std::env::var_os(root)?).join(rest))),
        )
        .find(|p| p.is_file())
        .or_else(|| {
            let path = std::env::var_os("PATH")?;
            std::env::split_paths(&path)
                .flat_map(|dir| PATH_NAMES.iter().map(move |n| dir.join(n)))
                .find(|p| p.is_file())
        })
}

static LEASES: Mutex<Option<HashMap<PathBuf, String>>> = Mutex::new(None);

/// The single controller lease on one profile directory, released on drop.
pub struct Lease(PathBuf);

impl Lease {
    pub fn acquire(profile: &Path, owner: &str) -> Result<Lease, String> {
        let mut leases = LEASES.lock().unwrap();
        let map = leases.get_or_insert_with(HashMap::new);
        match map.get(profile) {
            Some(holder) if holder != owner => {
                Err("This teammate's browser is being used by another task. Try again when it finishes.".into())
            }
            Some(_) => Err("This task already controls the browser.".into()),
            None => {
                map.insert(profile.to_path_buf(), owner.to_owned());
                Ok(Lease(profile.to_path_buf()))
            }
        }
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        if let Some(map) = LEASES.lock().unwrap().as_mut() {
            map.remove(&self.0);
        }
    }
}

/// A private (0700, not a symlink) profile directory.
pub fn prepare_profile(profile: &Path) -> Result<(), String> {
    std::fs::create_dir_all(profile).map_err(|_| "Could not create the Agent browser profile.")?;
    let meta = std::fs::symlink_metadata(profile).map_err(|e| e.to_string())?;
    if !meta.is_dir() || meta.file_type().is_symlink() {
        return Err("The Agent browser profile must be a private folder.".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(profile, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_file(profile.join("DevToolsActivePort"));
    Ok(())
}

pub struct Chrome {
    child: Child,
}

impl Chrome {
    /// Starts the browser controlled over `--remote-debugging-pipe` (no TCP
    /// debugging port exists). Returns what Chrome writes and what we write.
    pub fn launch(
        binary: &Path,
        profile: &Path,
        proxy_port: u16,
        headless: bool,
    ) -> Result<(Chrome, PipeReader, PipeWriter), String> {
        prepare_profile(profile)?;
        let mut command = Command::new(binary);
        command
            .arg(format!("--user-data-dir={}", profile.display()))
            .arg("--remote-debugging-pipe")
            .arg(format!("--proxy-server=http://127.0.0.1:{proxy_port}"))
            .args([
                "--proxy-bypass-list=<-loopback>",
                "--disable-quic",
                "--no-first-run",
                "--no-default-browser-check",
            ])
            .args([
                "--disable-background-networking",
                "--disable-sync",
                "--disable-extensions",
                "--disable-component-update",
            ])
            .args([
                "--disable-default-apps",
                "--deny-permission-prompts",
                // Sandboxed iframes stay in their page's process: an isolated one starts
                // running before the page guard can be placed in it.
                "--disable-features=Translate,MediaRouter,DialMediaRouteProvider,IsolateSandboxedIframes",
            ])
            .args([
                "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
                "--webrtc-ip-handling-policy=disable_non_proxied_udp",
            ])
            .arg("--window-size=1280,900")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if headless {
            command.args([
                "--headless=new",
                "--use-mock-keychain",
                "--password-store=basic",
            ]);
        }
        let (child, reader, writer) = super::pipe::spawn(command.arg("about:blank"))
            .map_err(|_| "Could not start the Agent browser.".to_string())?;
        Ok((Chrome { child }, reader, writer))
    }

    pub fn running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    #[cfg(test)]
    pub fn pid(&self) -> u32 {
        self.child.id()
    }
}

impl Drop for Chrome {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
