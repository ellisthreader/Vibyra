//! Native performance sampling for the renderer's perf watch.
//!
//! Lives in the app crate rather than `vibyra-core`, which is documented as
//! carrying no OS-probe dependencies; `renderer.rs` is where OS probing
//! already lives.
//!
//! **Poll-on-command.** Nothing runs in the background: `usePerfWatch` calls
//! `perf_sample` every 15 s, and only while the window is focused or a pane is
//! working. There is no thread to leak and no Rust-side tuning — deliberately
//! unlike `model_watch::spawn`, which has a reason to run headless.
//!
//! The `System` handle is built once, here, with a narrowed `RefreshKind`, so
//! `AppState` stays untouched. `System::new_all()` / `refresh_all()` are never
//! used: both walk every process on the machine on every sample, which is
//! exactly the cost this module exists to avoid.

use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use sysinfo::{
    CpuRefreshKind, MemoryRefreshKind, Pid, ProcessRefreshKind, ProcessesToUpdate, RefreshKind,
    System, MINIMUM_CPU_UPDATE_INTERVAL,
};

/// Whole-system CPU at which the child-process confirm pass below earns its
/// cost. Mirrors `CPU_DEGRADED` in `perfPolicy.ts`.
const CONFIRM_SYSTEM_CPU: f32 = 85.0;
/// Our own normalised CPU at which the confirm pass runs even on an otherwise
/// quiet machine. Mirrors `APP_CPU_DEGRADED`.
const CONFIRM_APP_CPU: f32 = 70.0;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PerfSample {
    /// Whole-system CPU, 0..=100.
    pub cpu_percent: f32,
    /// Vibyra's share, already divided by core count so 100 means "every core".
    pub app_cpu_percent: f32,
    pub mem_used_bytes: u64,
    pub mem_total_bytes: u64,
    /// Resident set of our process, plus WebKit children when the confirm pass
    /// ran. See [`add_children`].
    pub app_mem_bytes: u64,
    pub cores: usize,
}

fn refresh_kind() -> RefreshKind {
    RefreshKind::nothing()
        .with_memory(MemoryRefreshKind::nothing().with_ram())
        .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
}

/// CPU and RSS only, and never the per-thread `task` entries: on Linux those
/// mean an extra directory walk per process for numbers we do not read.
fn process_kind() -> ProcessRefreshKind {
    ProcessRefreshKind::nothing()
        .with_cpu()
        .with_memory()
        .without_tasks()
}

fn system() -> &'static Mutex<System> {
    static SYSTEM: OnceLock<Mutex<System>> = OnceLock::new();
    SYSTEM.get_or_init(|| {
        // On Linux sysinfo keeps a `/proc/<pid>/stat` handle open for every
        // process it has indexed, up to half the file-descriptor limit. Vibyra
        // already holds an FD per PTY, per watcher and per HTTP connection, so
        // letting a monitoring helper hoard hundreds more — permanently, after
        // one full walk in `add_children` — is not a trade we want. Zero means
        // "reopen each time", which for one process per sample is free.
        sysinfo::set_open_files_limit(0);
        let mut system = System::new_with_specifics(refresh_kind());
        // Every CPU percentage sysinfo reports is a delta between two reads, so
        // read #0 is always 0.0 % — for the system *and* for our process, which
        // is not even in the map until it is first refreshed. Take that
        // throwaway read here and wait out MINIMUM_CPU_UPDATE_INTERVAL, so the
        // first sample the UI ever sees is real rather than a fake "idle" that
        // the perf policy would score as a good window. Costs one ~200 ms sleep
        // per session, on the blocking thread `run_blocking` already gave us.
        if let Ok(pid) = sysinfo::get_current_pid() {
            system.refresh_processes_specifics(
                ProcessesToUpdate::Some(&[pid]),
                true,
                process_kind(),
            );
        }
        std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
        Mutex::new(system)
    })
}

/// On Linux WebKitGTK renders page content in a separate `WebKitWebProcess`
/// child (with network and GPU work in further children), so our own PID
/// under-reports what Vibyra actually costs — a busy terminal can look idle.
///
/// Attributing that properly means walking every process, which is precisely
/// what the narrowed refresh above avoids, so it runs *only* once a threshold
/// has already been crossed. Two walks are needed, not one: the children are
/// absent from the map until the first walk inserts them, and a freshly
/// inserted process reports 0.0 % CPU for the same delta reason as above.
/// Rare by construction — at most once per 15 s poll, in practice once per
/// cooldown.
fn add_children(system: &mut System, pid: Pid, cpu: &mut f32, mem: &mut u64) {
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, process_kind());
    std::thread::sleep(MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_processes_specifics(ProcessesToUpdate::All, true, process_kind());
    for process in system.processes().values() {
        if process.parent() == Some(pid) {
            *cpu += process.cpu_usage();
            *mem += process.memory();
        }
    }
}

/// One reading. Blocking — it reads `/proc` — so callers must route through
/// `run_blocking`; see `commands/perf.rs`.
pub fn sample() -> PerfSample {
    let mut system = system().lock().unwrap_or_else(|error| error.into_inner());
    system.refresh_cpu_usage();
    system.refresh_memory_specifics(MemoryRefreshKind::nothing().with_ram());

    // Identify our process by PID, never by name: an AppImage, a dev build and
    // a packaged build all present different executable names, and a user is
    // free to rename any of them.
    let pid = sysinfo::get_current_pid().ok();
    let mut app_cpu = 0.0_f32;
    let mut app_mem = 0_u64;
    if let Some(pid) = pid {
        system.refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, process_kind());
        if let Some(process) = system.process(pid) {
            app_cpu = process.cpu_usage();
            app_mem = process.memory();
        }
    }

    let cores = system.cpus().len().max(1);
    let cpu_percent = system.global_cpu_usage().clamp(0.0, 100.0);
    let normalised = app_cpu / cores as f32;
    if let Some(pid) = pid {
        if cpu_percent >= CONFIRM_SYSTEM_CPU || normalised >= CONFIRM_APP_CPU {
            add_children(&mut system, pid, &mut app_cpu, &mut app_mem);
        }
    }

    PerfSample {
        cpu_percent,
        app_cpu_percent: (app_cpu / cores as f32).clamp(0.0, 100.0),
        mem_used_bytes: system.used_memory(),
        mem_total_bytes: system.total_memory(),
        app_mem_bytes: app_mem,
        cores,
    }
}

#[cfg(test)]
#[path = "perf_tests.rs"]
mod tests;
