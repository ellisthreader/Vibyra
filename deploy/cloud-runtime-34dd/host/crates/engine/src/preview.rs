use crate::{text, Engine};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use std::{collections::BTreeMap, io::Read, time::Duration};

impl Engine {
    pub(crate) fn preview(&self, params: &Value) -> Result<Value, String> {
        let project = self.project(params)?;
        let port = params
            .get("port")
            .and_then(Value::as_u64)
            .filter(|p| (1..=65535).contains(p))
            .ok_or("invalid preview port")? as u16;
        if !self
            .shared
            .lock()
            .preview_ports
            .contains(&(project.id, port))
        {
            return Err("approve this project's preview port on your computer first".into());
        }
        let path = text(params, "path")?;
        if !path.starts_with('/')
            || path.starts_with("//")
            || path.contains('\\')
            || path.len() > 2048
            || path.chars().any(char::is_control)
        {
            return Err("preview path must be a relative HTTP path".into());
        }
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(format!("http://127.0.0.1:{port}{path}"))
            .send()
            .map_err(|_| "preview server is not responding on the approved port")?;
        let status = response.status().as_u16();
        if response.status().is_redirection() {
            return Err("preview redirects are not allowed".into());
        }
        let mut headers = BTreeMap::new();
        for name in ["content-type", "cache-control"] {
            if let Some(value) = response
                .headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .filter(|v| v.len() <= 256)
            {
                headers.insert(name, value.to_owned());
            }
        }
        let mut bytes = Vec::new();
        response
            .take(32 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 32 * 1024 {
            return Err("preview response exceeds 32 KiB; use a smaller static preview".into());
        }
        Ok(
            json!({"status":status,"headers":headers,"body":STANDARD.encode(bytes),"encoding":"base64"}),
        )
    }
}
