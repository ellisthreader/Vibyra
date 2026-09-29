/// The approval names one account and one computer. Never apply a stale
/// confirmation to a replacement identity or an account signed in afterward.
pub(crate) fn verify(
    expected_account: &str,
    expected_host: &str,
    account: &str,
    host: &str,
) -> Result<(), String> {
    if expected_account.is_empty()
        || expected_host.is_empty()
        || expected_account != account
        || expected_host != host
    {
        return Err("The account or computer changed. Review the transfer again.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::verify;
    #[test]
    fn approval_only_applies_to_the_named_account_and_computer() {
        assert!(verify("a", "host-a", "a", "host-a").is_ok());
        assert!(verify("a", "host-a", "b", "host-a").is_err());
        assert!(verify("a", "host-a", "a", "host-b").is_err());
        assert!(verify("", "host-a", "", "host-a").is_err());
        assert!(verify("a", "", "a", "").is_err());
    }
}
