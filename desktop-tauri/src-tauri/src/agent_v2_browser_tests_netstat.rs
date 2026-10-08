//! BSD netstat's owner column changed from numeric pid to process:pid.
//! Read its header instead of guessing offsets or accepting unknown ownership.
pub(super) fn listeners(table: &str, pids: &[u32]) -> Result<Vec<String>, String> {
    let header = table
        .lines()
        .find(|line| line.trim_start().starts_with("Proto "))
        .ok_or("netstat has no TCP header")?;
    let normalized = header
        .replace("Local Address", "LocalAddress")
        .replace("Foreign Address", "ForeignAddress");
    let columns: Vec<_> = normalized.split_whitespace().collect();
    let owners: Vec<_> = columns
        .iter()
        .enumerate()
        .filter(|(_, name)| matches!(**name, "pid" | "process:pid"))
        .map(|(index, _)| index)
        .collect();
    if owners.len() != 1 {
        return Err("netstat has no unique owner column".into());
    }
    let local = columns
        .iter()
        .position(|name| *name == "LocalAddress")
        .ok_or("netstat has no local address column")?;
    let state = columns
        .iter()
        .position(|name| *name == "(state)")
        .ok_or("netstat has no TCP state column")?;
    let mut found = Vec::new();
    for line in table
        .lines()
        .filter(|line| line.trim_start().starts_with("tcp"))
    {
        let row: Vec<_> = line.split_whitespace().collect();
        if row.get(state).copied() != Some("LISTEN") {
            continue;
        }
        // New netstat may print spaces inside the process name. Columns after
        // the owner remain single tokens, so count backwards from the row end.
        let owner_index = row
            .len()
            .checked_sub(columns.len() - owners[0])
            .ok_or("netstat listener has no owner")?;
        if owner_index < owners[0] {
            return Err("netstat listener is truncated".into());
        }
        let owner = row
            .get(owner_index)
            .ok_or("netstat listener has no owner")?;
        let raw_pid = owner.rsplit_once(':').map_or(*owner, |(_, pid)| pid);
        let pid = raw_pid
            .parse::<u32>()
            .map_err(|_| "netstat listener owner is invalid")?;
        let address = row
            .get(local)
            .ok_or("netstat listener has no local address")?;
        if pids.contains(&pid) {
            found.push(format!("{address} pid {pid}"));
        }
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::listeners;
    const OLD: &str = "Proto Recv-Q Send-Q Local Address Foreign Address (state) rhiwat shiwat pid epid state options\n";
    const NEW: &str = "Proto Recv-Q Send-Q Local Address Foreign Address (state) rxbytes txbytes rhiwat shiwat process:pid state options\n";
    #[test]
    fn numeric_owner_matches_the_pid_not_buffers_or_effective_pid() {
        let table = format!("{OLD}tcp4 0 0 127.0.0.1.1234 *.* LISTEN 99 42 73 42 0 0\n");
        assert_eq!(listeners(&table, &[73]).unwrap(), ["127.0.0.1.1234 pid 73"]);
        assert!(listeners(&table, &[42]).unwrap().is_empty());
    }
    #[test]
    fn named_owner_handles_new_byte_counter_columns_and_ipv6() {
        let table = format!("{NEW}tcp6 0 0 ::1.9222 *.* LISTEN 0 0 131072 131072 Chrome:73 0 0\n");
        assert_eq!(listeners(&table, &[73]).unwrap(), ["::1.9222 pid 73"]);
        assert!(listeners(&table, &[131072]).unwrap().is_empty());
    }
    #[test]
    fn process_names_with_spaces_keep_the_exact_owner() {
        let table =
            format!("{NEW}tcp4 0 0 127.0.0.1.9222 *.* LISTEN 0 0 1 1 Google Chrome:73 0 0\n");
        assert_eq!(listeners(&table, &[73]).unwrap(), ["127.0.0.1.9222 pid 73"]);
    }
    #[test]
    fn established_connections_are_not_listeners() {
        let table =
            format!("{OLD}tcp4 0 0 127.0.0.1.1234 127.0.0.1.5678 ESTABLISHED 99 42 73 42 0 0\n");
        assert!(listeners(&table, &[73]).unwrap().is_empty());
    }
    #[test]
    fn unknown_output_and_ambiguous_owner_fail_closed() {
        assert!(listeners("", &[73]).is_err());
        assert!(listeners(&OLD.replace("pid epid", "pid pid"), &[73]).is_err());
        let malformed = format!("{NEW}tcp4 0 0 127.0.0.1.1234 *.* LISTEN 0 0 1 1 unknown 0 0\n");
        assert!(listeners(&malformed, &[73]).is_err());
    }
}
