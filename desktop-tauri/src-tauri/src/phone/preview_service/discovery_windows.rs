//! Windows TCP listeners with their owning process, from the IP Helper API.

use super::Listener;
use windows::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCP6TABLE_OWNER_PID, MIB_TCPTABLE_OWNER_PID,
    TCP_TABLE_OWNER_PID_LISTENER,
};
use windows::Win32::Networking::WinSock::{AF_INET, AF_INET6};

pub(super) fn listeners() -> Option<Vec<Listener>> {
    let mut found = Vec::new();
    let v4 = table(AF_INET.0 as u32)?;
    // SAFETY: the buffer holds a complete table as sized by Windows.
    unsafe {
        let head = &*(v4.as_ptr() as *const MIB_TCPTABLE_OWNER_PID);
        let rows = std::slice::from_raw_parts(head.table.as_ptr(), head.dwNumEntries as usize);
        for row in rows {
            let address = u32::from_be(row.dwLocalAddr);
            if address == 0 || address == 0x7f00_0001 {
                let port = u16::from_be(row.dwLocalPort as u16);
                found.push(Listener {
                    pid: row.dwOwningPid,
                    port,
                    ipv6: false,
                });
            }
        }
    }
    if let Some(v6) = table(AF_INET6.0 as u32) {
        // SAFETY: as above, for the IPv6 table.
        unsafe {
            let head = &*(v6.as_ptr() as *const MIB_TCP6TABLE_OWNER_PID);
            let rows = std::slice::from_raw_parts(head.table.as_ptr(), head.dwNumEntries as usize);
            for row in rows {
                let local = row.ucLocalAddr;
                let any = local == [0; 16];
                let loopback = local[..15] == [0; 15] && local[15] == 1;
                if any || loopback {
                    let port = u16::from_be(row.dwLocalPort as u16);
                    found.push(Listener {
                        pid: row.dwOwningPid,
                        port,
                        ipv6: true,
                    });
                }
            }
        }
    }
    found.retain(|listener| listener.port > 0);
    found.sort_unstable();
    found.dedup();
    Some(found)
}

/// The listener table for one address family, grown until it fits.
fn table(family: u32) -> Option<Vec<u64>> {
    let mut size = 0u32;
    for _ in 0..4 {
        let mut buffer = vec![0u64; (size as usize).div_ceil(8).max(1)];
        // SAFETY: Windows writes at most `size` bytes into the buffer.
        let status = unsafe {
            GetExtendedTcpTable(
                Some(buffer.as_mut_ptr().cast()),
                &mut size,
                false,
                family,
                TCP_TABLE_OWNER_PID_LISTENER,
                0,
            )
        };
        if status == 0 {
            return Some(buffer);
        }
    }
    None
}
