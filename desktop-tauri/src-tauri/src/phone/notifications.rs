//! Explicit, runtime-scoped consent. Only state metadata crosses this boundary.
use super::PhoneConnection;
use crate::account_api::{request, Endpoint};
use serde_json::json;
use std::sync::Arc;
impl PhoneConnection {
    pub fn set_notifications(&mut self, on: bool) -> Result<(), String> {
        self.notifications = None;
        if !on {
            return Ok(());
        }
        let host = self.host()?;
        let account = self
            .account
            .clone()
            .ok_or(crate::platform_text::for_computer(
                "Sign in on this Mac first.",
                "Sign in on this computer first.",
            ))?;
        let owner = account.token().ok_or(crate::platform_text::for_computer(
            "Sign in on this Mac first.",
            "Sign in on this computer first.",
        ))?;
        let host_id = host.id();
        let send = Arc::new(move |events: Vec<serde_json::Value>| {
            let account = account.clone();
            let owner = owner.clone();
            let host_id = host_id.clone();
            Box::pin(async move {
                if account.token().as_deref() != Some(owner.as_str()) {
                    return Err("Account session changed. Enable notifications again.".into());
                }
                let grant = request(
                    Endpoint::HostNotificationCredential,
                    Some(&owner),
                    Some(json!({"hostId":host_id})),
                )
                .await
                .map_err(|_| "Computer notifications are unavailable.".to_string())?;
                let token = grant["token"]
                    .as_str()
                    .ok_or("No notification credential.")?;
                if account.token().as_deref() != Some(owner.as_str()) {
                    return Err("Account session changed.".into());
                }
                request(
                    Endpoint::HostNotificationEvents,
                    Some(token),
                    Some(json!({"events":events})),
                )
                .await
                .map_err(|_| "Computer notifications could not be delivered.".to_string())?;
                Ok(())
            })
                as std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>>
        });
        self.notifications =
            Some(host.notifications(self.path.join("notification-observations.json"), send));
        Ok(())
    }
}
