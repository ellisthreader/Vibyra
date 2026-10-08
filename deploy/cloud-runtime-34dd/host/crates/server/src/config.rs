use clap::Parser;
use std::{net::SocketAddr, path::PathBuf};

#[derive(Parser)]
#[command(name = "vibyra-host", about = "Run Vibyra terminals on this computer")]
pub struct Config {
    #[arg(long, default_value = "127.0.0.1:4318")]
    pub listen: SocketAddr,
    /// Pairing address reachable by your phone, e.g. ws://192.168.1.4:4318.
    #[arg(long)]
    pub public_url: Option<String>,
    #[arg(long)]
    pub name: Option<String>,
    #[arg(long)]
    pub state_dir: Option<PathBuf>,
    /// Explicitly expose a project directory. Repeat for multiple projects.
    #[arg(long, required_unless_present = "projects_dir")]
    pub project: Vec<PathBuf>,
    /// Locally allow a project preview port, formatted PROJECT_NAME:PORT.
    #[arg(long)]
    pub preview: Vec<String>,
    #[arg(long, conflicts_with = "account_mode")]
    pub relay: Option<String>,
    #[arg(long, requires = "relay")]
    pub relay_token_file: Option<PathBuf>,
    /// Show a fresh, single-use two-minute pairing invitation at startup.
    #[arg(long)]
    pub pair: bool,
    /// Let nearby phones find this Host using Bonjour and ask to pair without a
    /// code, still subject to local approval. Requires a LAN listener.
    #[arg(long)]
    pub discover: bool,
    /// Share every sub-folder of this directory as a project, including ones
    /// created while the Host runs.
    #[arg(long)]
    pub projects_dir: Option<PathBuf>,
    /// Run as an account-bound cloud computer: relay credentials come from the
    /// Vibyra account API before every attempt. Needs --api-base, --workspace-id,
    /// --runtime-token-file and --state-dir.
    #[arg(long, requires_all = ["api_base", "workspace_id", "runtime_token_file", "state_dir"])]
    pub account_mode: bool,
    #[arg(long, requires = "account_mode")]
    pub api_base: Option<String>,
    #[arg(long, requires = "account_mode")]
    pub workspace_id: Option<String>,
    /// File holding the runtime bearer token; read again before every call,
    /// because it can rotate.
    #[arg(long, requires = "account_mode")]
    pub runtime_token_file: Option<PathBuf>,
    /// Seconds between activity reports to the account API.
    #[arg(long, default_value_t = 15, value_parser = clap::value_parser!(u64).range(1..=3600), requires = "account_mode")]
    pub activity_interval: u64,
    /// A terminal with no output or input for this long no longer keeps the
    /// computer awake.
    #[arg(long, default_value_t = 600, value_parser = clap::value_parser!(u64).range(60..=86400), requires = "account_mode")]
    pub idle_session_secs: u64,
}

/// Everything account mode needs, validated once at startup.
#[derive(Clone, Debug)]
pub struct Account {
    pub api_base: String,
    pub workspace_id: String,
    pub token_file: PathBuf,
    pub interval: u64,
    pub idle_session_secs: u64,
}

impl Config {
    pub fn account(&self) -> Result<Option<Account>, String> {
        if !self.account_mode {
            return Ok(None);
        }
        let api_base = self.api_base.clone().ok_or("--api-base is required")?;
        crate::account_http::parse(&api_base)?;
        let workspace_id = self
            .workspace_id
            .clone()
            .ok_or("--workspace-id is required")?;
        if workspace_id.is_empty()
            || workspace_id.len() > 64
            || !workspace_id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        {
            return Err("Invalid --workspace-id".into());
        }
        Ok(Some(Account {
            api_base: api_base.trim_end_matches('/').to_owned(),
            workspace_id,
            token_file: self
                .runtime_token_file
                .clone()
                .ok_or("--runtime-token-file is required")?,
            interval: self.activity_interval,
            idle_session_secs: self.idle_session_secs,
        }))
    }

    pub fn state_path(&self) -> Result<PathBuf, String> {
        self.state_dir
            .clone()
            .or_else(|| dirs::data_local_dir().map(|p| p.join("vibyra-host")))
            .ok_or("No user state directory available; provide --state-dir".into())
    }

    pub fn pairing_url(&self) -> String {
        self.relay
            .clone()
            .or_else(|| self.public_url.clone())
            .unwrap_or_else(|| format!("ws://{}", self.listen))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(args: &[&str]) -> Result<Config, clap::Error> {
        Config::try_parse_from(std::iter::once("vibyra-host").chain(args.iter().copied()))
    }
    const ACCOUNT: [&str; 9] = [
        "--account-mode",
        "--api-base",
        "https://api.example.app",
        "--workspace-id",
        "6f1c-22",
        "--runtime-token-file",
        "/data/token",
        "--state-dir",
        "/data/host",
    ];

    #[test]
    fn standalone_flags_are_unchanged() {
        assert!(parse(&[]).is_err());
        let config = parse(&["--project", "/p"]).unwrap();
        assert!(!config.account_mode && config.account().unwrap().is_none());
        assert_eq!(config.activity_interval, 15);
        assert_eq!(config.idle_session_secs, 600);
        assert!(parse(&["--project", "/p", "--idle-session-secs", "120"]).is_err());
        assert!(parse(&["--project", "/p", "--api-base", "https://x.app"]).is_err());
    }

    #[test]
    fn account_mode_takes_projects_from_a_directory_and_validates() {
        let mut args = ACCOUNT.to_vec();
        args.extend([
            "--projects-dir",
            "/data/projects",
            "--activity-interval",
            "5",
        ]);
        let account = parse(&args).unwrap().account().unwrap().unwrap();
        assert_eq!(account.interval, 5);
        assert_eq!(account.workspace_id, "6f1c-22");
        assert_eq!(account.api_base, "https://api.example.app");
    }

    #[test]
    fn idle_session_window_is_bounded_and_account_only() {
        let with = |secs: &'static str| {
            let mut args = ACCOUNT.to_vec();
            args.extend([
                "--projects-dir",
                "/data/projects",
                "--idle-session-secs",
                secs,
            ]);
            parse(&args)
        };
        assert_eq!(
            with("60")
                .unwrap()
                .account()
                .unwrap()
                .unwrap()
                .idle_session_secs,
            60
        );
        assert_eq!(with("86400").unwrap().idle_session_secs, 86400);
        assert!(with("59").is_err() && with("86401").is_err() && with("x").is_err());
        let mut args = ACCOUNT.to_vec();
        args.extend(["--projects-dir", "/d"]);
        assert_eq!(parse(&args).unwrap().idle_session_secs, 600);
    }

    #[test]
    fn account_mode_refuses_missing_or_unsafe_settings() {
        let without = |flag: &str| {
            let mut args: Vec<&str> = Vec::new();
            let mut skip = false;
            for part in ACCOUNT {
                if part == flag {
                    skip = true;
                    continue;
                }
                if skip && !part.starts_with("--") {
                    continue;
                }
                skip = false;
                args.push(part);
            }
            args.extend(["--projects-dir", "/p"]);
            parse(&args).map(|_| ())
        };
        for flag in [
            "--api-base",
            "--workspace-id",
            "--runtime-token-file",
            "--state-dir",
        ] {
            assert!(without(flag).is_err(), "{flag}");
        }
        let mut insecure = ACCOUNT.to_vec();
        insecure[2] = "http://api.example.app";
        insecure.extend(["--projects-dir", "/p"]);
        assert!(parse(&insecure).unwrap().account().is_err());
        let mut relay = ACCOUNT.to_vec();
        relay.extend(["--projects-dir", "/p", "--relay", "wss://r.example"]);
        assert!(parse(&relay).is_err());
        let mut bad_workspace = ACCOUNT.to_vec();
        bad_workspace[4] = "../etc";
        bad_workspace.extend(["--projects-dir", "/p"]);
        assert!(parse(&bad_workspace).unwrap().account().is_err());
    }
}
