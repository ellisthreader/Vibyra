#[cfg(target_os = "macos")]
use std::process::Command;

#[cfg(target_os = "macos")]
fn system_value(key: &str) -> Option<String> {
    let output = Command::new("/usr/sbin/sysctl")
        .args(["-n", key])
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(target_os = "macos")]
pub fn description() -> String {
    let model = system_value("hw.model").unwrap_or_else(|| "unknown Mac".into());
    let cpu =
        system_value("machdep.cpu.brand_string").unwrap_or_else(|| std::env::consts::ARCH.into());
    let memory = system_value("hw.memsize")
        .and_then(|value| value.parse::<u64>().ok())
        .map(|bytes| format!("{} GiB", bytes / 1_073_741_824))
        .unwrap_or_else(|| "unknown memory".into());
    format!("{model}; {cpu}; {memory}")
}

#[cfg(target_os = "linux")]
pub fn description() -> String {
    let model = std::fs::read_to_string("/sys/devices/virtual/dmi/id/product_name")
        .unwrap_or_else(|_| "Linux computer".into())
        .trim()
        .to_owned();
    let cpu = std::fs::read_to_string("/proc/cpuinfo")
        .ok()
        .and_then(|text| {
            text.lines()
                .find_map(|line| line.strip_prefix("model name\t: ").map(str::to_owned))
        })
        .unwrap_or_else(|| std::env::consts::ARCH.into());
    let memory = std::fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|text| {
            text.lines().find_map(|line| {
                line.strip_prefix("MemTotal:")
                    .and_then(|value| value.split_whitespace().next())
                    .and_then(|value| value.parse::<u64>().ok())
            })
        })
        .map(|kb| format!("{} GiB", kb / 1_048_576))
        .unwrap_or_else(|| "unknown memory".into());
    format!("{model}; {cpu}; {memory}")
}

/// Model and processor from the registry, memory from the system: the same
/// three facts the Mac and Linux reports give.
#[cfg(target_os = "windows")]
pub fn description() -> String {
    let model = registry_text("HARDWARE\\DESCRIPTION\\System\\BIOS", "SystemProductName")
        .unwrap_or_else(|| "Windows PC".into());
    let cpu = registry_text(
        "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0",
        "ProcessorNameString",
    )
    .unwrap_or_else(|| std::env::consts::ARCH.into());
    let memory = installed_memory()
        .map(|bytes| format!("{} GiB", bytes / 1_073_741_824))
        .unwrap_or_else(|| "unknown memory".into());
    format!("{model}; {cpu}; {memory}")
}

#[cfg(target_os = "windows")]
fn registry_text(key: &str, value: &str) -> Option<String> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let mut buffer = [0u16; 256];
    let mut size = std::mem::size_of_val(&buffer) as u32;
    // SAFETY: the buffer and its byte size outlive the call.
    let status = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            &HSTRING::from(key),
            &HSTRING::from(value),
            RRF_RT_REG_SZ,
            None,
            Some(buffer.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if status.is_err() {
        return None;
    }
    let length = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(buffer.len());
    Some(
        String::from_utf16_lossy(&buffer[..length])
            .trim()
            .to_owned(),
    )
    .filter(|text| !text.is_empty())
}

#[cfg(target_os = "windows")]
fn installed_memory() -> Option<u64> {
    use windows::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: a correctly sized, initialised out-struct.
    unsafe { GlobalMemoryStatusEx(&mut status) }.ok()?;
    Some(status.ullTotalPhys)
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
pub fn description() -> String {
    std::env::consts::ARCH.into()
}
