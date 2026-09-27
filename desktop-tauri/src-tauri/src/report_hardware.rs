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

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
pub fn description() -> String {
    std::env::consts::ARCH.into()
}
