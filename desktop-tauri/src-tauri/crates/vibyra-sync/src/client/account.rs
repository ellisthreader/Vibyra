use super::types::{AccountState, DownItem, MacRecord};
use super::{Client, Project};
use crate::error::{Result, SyncError};
use reqwest::Method;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

/// The account read's path: the device id is a UUID, safe in a query as it is.
fn account_path(mac_id: &str) -> String {
    format!("?mac={mac_id}")
}

fn field<T: DeserializeOwned>(v: &Value, key: &str) -> Result<T> {
    serde_json::from_value(v.get(key).cloned().unwrap_or(Value::Null)).map_err(|_| {
        SyncError::Invalid(format!("The account service reply had no usable `{key}`."))
    })
}

impl Client {
    /// `PUT /macs/{deviceId}`; `replace` lets the server drop the oldest unused Mac when five exist.
    pub fn put_mac(
        &self,
        device_id: &str,
        public_key_hex: &str,
        name: &str,
        replace: bool,
    ) -> Result<MacRecord> {
        let mut body = json!({ "publicKey": public_key_hex, "name": name });
        if replace {
            body["replace"] = json!(true);
        }
        field(
            &self.json(Method::PUT, &format!("/macs/{device_id}"), Some(body))?,
            "mac",
        )
    }

    /// `GET /?mac={deviceId}`: every read is also this Mac checking in, so the iPhone can tell whether the Mac
    /// that uploads is around ("Waiting for your Mac … last seen …").
    pub fn account_state(&self, mac_id: &str) -> Result<AccountState> {
        serde_json::from_value(self.json(Method::GET, &account_path(mac_id), None)?).map_err(|_| {
            SyncError::Invalid("The account service sent an unexpected sync state.".into())
        })
    }

    /// `POST /projects` (idempotent). `skipped = Some(reason)` tells the cloud this project is not syncable.
    pub fn post_project(
        &self,
        project_key: &str,
        name: &str,
        skipped: Option<&str>,
    ) -> Result<Project> {
        let mut body = json!({ "projectKey": project_key, "name": name });
        if let Some(reason) = skipped {
            body["skipped"] = json!({ "reason": reason });
        }
        field(
            &self.json(Method::POST, "/projects", Some(body))?,
            "project",
        )
    }

    /// `DELETE /projects/{name}`
    pub fn delete_project(&self, name: &str) -> Result<()> {
        self.json(Method::DELETE, &format!("/projects/{name}"), None)
            .map(|_| ())
    }

    /// `GET /down?mac=<deviceId>`
    pub fn list_down(&self, mac_id: &str) -> Result<Vec<DownItem>> {
        field(
            &self.json(Method::GET, &format!("/down?mac={mac_id}"), None)?,
            "items",
        )
    }

    /// `POST /down/{id}/ack`
    pub fn ack_down(&self, id: &str, applied: bool, error: Option<&str>) -> Result<()> {
        let mut body = json!({ "applied": applied });
        if let Some(e) = error {
            body["error"] = json!(e.chars().take(300).collect::<String>());
        }
        self.json(Method::POST, &format!("/down/{id}/ack"), Some(body))
            .map(|_| ())
    }
}

/// `POST /api/auth/login` (the account's own login, not a sync endpoint); returns the bearer token.
pub fn login(
    base_url: &str,
    email: &str,
    password: &str,
    device_name: &str,
    install_id: &str,
) -> Result<String> {
    let base = super::check_base_url(base_url)?;
    let http = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| SyncError::Network(crate::client::network_detail(e)))?;
    let resp = http
        .post(format!("{base}/api/auth/login"))
        .header("Accept", "application/json")
        .json(&json!({ "email": email.trim().to_lowercase(), "password": password, "deviceName": device_name, "installId": install_id }))
        .send()
        .map_err(|e| SyncError::Network(crate::client::network_detail(e)))?;
    let value = super::check(resp)?;
    match value.get("token").and_then(Value::as_str) {
        Some(t) => Ok(t.to_string()),
        None => Err(SyncError::Invalid(
            "This account needs a second factor; sign in through the app.".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::super::Client;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    #[test]
    fn every_account_read_says_which_mac_is_checking_in() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut line = String::new();
            BufReader::new(stream.try_clone().unwrap())
                .read_line(&mut line)
                .unwrap();
            let body = "{}";
            write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            line
        });
        let client = Client::new(&format!("http://127.0.0.1:{port}"), "token").unwrap();
        let _ = client.account_state("6f1c2a9e-0d4b-4c51-9a3e-2b7d8e9f0a1b");
        assert_eq!(
            server.join().unwrap().trim_end(),
            "GET /api/cloud-computer/sync?mac=6f1c2a9e-0d4b-4c51-9a3e-2b7d8e9f0a1b HTTP/1.1"
        );
    }
}
