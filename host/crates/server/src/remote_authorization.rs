//! Server-signed, short-lived authorization inside the account relay. Noise
//! still proves the phone identity; neither bearer nor relay metadata can do so.
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use ring::signature::{UnparsedPublicKey, ED25519};
use serde::Deserialize;
use std::{
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const DENIED: &str = "Remote session authorization is unavailable or expired";
pub(crate) type Access = Option<Arc<Authorization>>;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthorizationContext {
    pub user_id: String,
    pub generation: u64,
}

#[derive(Clone, Debug, Deserialize, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Claims {
    pub v: u8,
    pub sub: String,
    pub generation: u64,
    pub session_id: String,
    pub host_id: String,
    pub device_id: String,
    pub permissions: Vec<String>,
    pub iat: u64,
    pub exp: u64,
    pub session_expires_at: u64,
    pub jti: String,
}
pub(crate) struct Authorization {
    key: Vec<u8>,
    pub claims: Claims,
    lease: Mutex<(u64, u64)>,
}
impl Authorization {
    pub fn new(
        key: &str,
        token: &str,
        host: &str,
        context: &AuthorizationContext,
    ) -> Result<Arc<Self>, String> {
        let key = STANDARD.decode(key).map_err(|_| DENIED)?;
        if key.len() != 32 {
            return Err(DENIED.into());
        }
        let claims = verify(&key, token, now())?;
        if claims.host_id != host
            || claims.sub != context.user_id
            || claims.generation != context.generation
        {
            return Err(DENIED.into());
        }
        Ok(Arc::new(Self {
            key,
            lease: Mutex::new((claims.iat, claims.exp)),
            claims,
        }))
    }
    pub fn renew(&self, token: &str) -> Result<(), String> {
        let update = verify(&self.key, token, now())?;
        let mut expected = self.claims.clone();
        expected.iat = update.iat;
        expected.exp = update.exp;
        if update != expected {
            return Err(DENIED.into());
        }
        let mut lease = self.lease.lock().map_err(|_| DENIED)?;
        // An expired lease cannot be revived; reconnect requires a new grant.
        if lease.1 <= now() || update.iat < lease.0 || update.exp < lease.1 {
            return Err(DENIED.into());
        }
        *lease = (update.iat, update.exp);
        Ok(())
    }
    pub(crate) fn revoke(&self) {
        if let Ok(mut lease) = self.lease.lock() {
            lease.1 = 0;
        }
    }
    pub fn valid(&self) -> Result<(), String> {
        let lease = self.lease.lock().map_err(|_| DENIED)?;
        if lease.1 <= now() || self.claims.session_expires_at <= now() {
            Err(DENIED.into())
        } else {
            Ok(())
        }
    }
    pub fn permits(&self, permission: &str) -> bool {
        self.claims.permissions.iter().any(|p| p == permission)
    }
    pub fn bind(&self, device: &str, hello: &[u8]) -> Result<(), String> {
        self.valid()?;
        let hello: serde_json::Value = serde_json::from_slice(hello).map_err(|_| DENIED)?;
        if self.claims.device_id != device
            || hello["remoteSessionId"].as_str() != Some(self.claims.session_id.as_str())
            || hello["remoteAuthorizationId"].as_str() != Some(self.claims.jti.as_str())
        {
            return Err(DENIED.into());
        }
        Ok(())
    }
}

pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(u64::MAX, |n| n.as_secs())
}
fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn key_id(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
fn verify(key: &[u8], token: &str, now: u64) -> Result<Claims, String> {
    if token.len() > 4096 {
        return Err(DENIED.into());
    }
    let parts: Vec<_> = token.split('.').collect();
    if parts.len() != 3 || parts[0] != "ra1" {
        return Err(DENIED.into());
    }
    let signature = URL_SAFE_NO_PAD.decode(parts[2]).map_err(|_| DENIED)?;
    UnparsedPublicKey::new(&ED25519, key)
        .verify(format!("ra1.{}", parts[1]).as_bytes(), &signature)
        .map_err(|_| DENIED)?;
    let body = URL_SAFE_NO_PAD.decode(parts[1]).map_err(|_| DENIED)?;
    let claims: Claims = serde_json::from_slice(&body).map_err(|_| DENIED)?;
    if claims.v != 1
        || !identifier(&claims.sub)
        || claims.generation == 0
        || !identifier(&claims.session_id)
        || !identifier(&claims.jti)
        || claims.jti != claims.session_id
        || !key_id(&claims.host_id)
        || !key_id(&claims.device_id)
        || claims.iat > now.saturating_add(30)
        || claims.exp <= now
        || claims.exp <= claims.iat
        || claims.exp > claims.iat.saturating_add(120)
        || claims.exp > claims.session_expires_at
        || claims.session_expires_at > claims.iat.saturating_add(12 * 60 * 60)
        || claims.permissions.is_empty()
        || claims.permissions.len() > 10
    {
        return Err(DENIED.into());
    }
    let mut seen = std::collections::HashSet::new();
    for permission in &claims.permissions {
        if !super::remote_permissions::known(permission) || !seen.insert(permission) {
            return Err(DENIED.into());
        }
    }
    Ok(claims)
}

#[cfg(test)]
#[path = "remote_authorization_tests.rs"]
mod tests;
