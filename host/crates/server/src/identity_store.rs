//! Migrate the existing private key only after the OS store confirms the same
//! bytes can be read. Failure never replaces the identity or falls back to disk.
use crate::identity::Identity;
use serde::{Deserialize, Serialize};

pub trait IdentityKeyStore: Send + Sync {
    fn read(&self, public_key: &str) -> Result<Option<String>, String>;
    fn write(&self, public_key: &str, private_key: &str) -> Result<(), String>;
}

#[derive(Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum KeyStorage {
    #[default]
    File,
    CredentialStore,
}

pub(crate) fn restore_or_migrate(
    identity: &mut Identity,
    store: Option<&dyn IdentityKeyStore>,
) -> Result<bool, String> {
    if identity.key_storage == KeyStorage::CredentialStore {
        let store = store.ok_or("Host identity requires the operating-system credential store")?;
        identity.private_key = store
            .read(&identity.public_key)?
            .ok_or("Host private key is missing from the operating-system credential store")?;
        validate(identity)?;
        return Ok(false);
    }
    validate(identity)?;
    let Some(store) = store else {
        static WARNING: std::sync::Once = std::sync::Once::new();
        WARNING.call_once(|| eprintln!("Warning: Host identity uses protected local file storage; no operating-system credential store was supplied."));
        return Ok(false);
    };
    match store.read(&identity.public_key)? {
        Some(existing) if existing != identity.private_key => {
            return Err(
                "Host private key does not match the operating-system credential store".into(),
            );
        }
        Some(_) => {}
        None => store.write(&identity.public_key, &identity.private_key)?,
    }
    if store.read(&identity.public_key)?.as_deref() != Some(identity.private_key.as_str()) {
        return Err(
            "Host private key could not be verified in the operating-system credential store"
                .into(),
        );
    }
    identity.key_storage = KeyStorage::CredentialStore;
    Ok(true)
}

fn validate(identity: &Identity) -> Result<(), String> {
    let bytes: [u8; 32] = hex::decode(&identity.private_key)
        .map_err(|_| "Invalid host private key")?
        .try_into()
        .map_err(|_| "Invalid host private key length")?;
    let key = crypto_box::SecretKey::from(bytes);
    if hex::encode(key.public_key().as_bytes()) != identity.public_key {
        return Err("Host public and private keys do not match".into());
    }
    Ok(())
}

#[cfg(test)]
#[path = "identity_store_tests.rs"]
mod tests;
