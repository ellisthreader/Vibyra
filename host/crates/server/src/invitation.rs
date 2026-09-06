use crate::identity::Identity;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration, Utc};
use serde_json::json;
use subtle::ConstantTimeEq;

pub struct Invitation {
    token: String,
    expires: chrono::DateTime<Utc>,
}

impl Invitation {
    pub fn create(identity: &Identity, url: &str, relay: bool) -> Result<(Self, String), String> {
        let parsed = url::Url::parse(url).map_err(|_| "Invalid pairing URL")?;
        if !matches!(parsed.scheme(), "ws" | "wss")
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("Pairing URL must be ws:// or wss:// without credentials".into());
        }
        let token = hex::encode(&vibyra_transport::generate_keypair()?[..32]);
        let expires = Utc::now() + Duration::seconds(120);
        let data = json!({"version":1,"hostId":identity.id(),"name":identity.name,
            "publicKey":identity.public_key,"url":url,"invite":token,"expiresAt":expires.to_rfc3339(),
            "route":if relay { "relay" } else { "direct" }});
        let uri = format!(
            "vibyra://pair?data={}",
            URL_SAFE_NO_PAD.encode(data.to_string())
        );
        Ok((Self { token, expires }, uri))
    }

    pub fn valid(&self, token: &str) -> bool {
        self.expires > Utc::now() && bool::from(self.token.as_bytes().ct_eq(token.as_bytes()))
    }
}
