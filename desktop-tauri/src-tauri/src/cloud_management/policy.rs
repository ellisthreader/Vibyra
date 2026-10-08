use super::Receipt;
use crate::commands::cloud_page::CloudOverview;
pub(crate) fn registered(hosts: &serde_json::Value, host: &str) -> bool {
    hosts["computers"]
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item["id"] == host))
}
pub(crate) fn eligible(overview: &CloudOverview) -> bool {
    overview.computer["enabled"] == true
        && overview.computer["connected"] == true
        && overview.computer["consentVersion"]
            .as_u64()
            .is_some_and(|v| v > 0)
}
pub(crate) fn same_phone(receipt: &Receipt, host: &str, status: &serde_json::Value) -> bool {
    status["enabled"] == true
        && host == receipt.host
        && !receipt.device.is_empty()
        && !receipt.approved_at.is_empty()
        && !receipt.generation.is_empty()
        && status["devices"].as_array().is_some_and(|devices| {
            devices.iter().any(|device| {
                device["id"] == receipt.device && device["createdAt"] == receipt.approved_at
            })
        })
}
#[cfg(test)]
mod tests;
