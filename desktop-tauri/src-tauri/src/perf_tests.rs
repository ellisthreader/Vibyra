use super::*;

/// The renderer reads these keys by name (`src/lib/perfPolicy.ts`), so the
/// camelCase mapping is part of the contract, not a formatting choice.
#[test]
fn serialises_camel_case() {
    let sample = PerfSample {
        cpu_percent: 12.5,
        app_cpu_percent: 3.25,
        renderer_cpu_percent: Some(88.0),
        mem_used_bytes: 1,
        mem_total_bytes: 2,
        app_mem_bytes: 3,
        cores: 4,
    };
    let value = serde_json::to_value(&sample).unwrap();
    let object = value.as_object().unwrap();
    for key in [
        "cpuPercent",
        "appCpuPercent",
        "rendererCpuPercent",
        "memUsedBytes",
        "memTotalBytes",
        "appMemBytes",
        "cores",
    ] {
        assert!(object.contains_key(key), "missing {key}");
    }
    assert_eq!(object.len(), 7);
}

/// Ranges only. A live machine's CPU and memory are whatever they are at the
/// moment CI runs, so any exact assertion here is a future flake.
#[test]
fn a_live_sample_is_within_plausible_ranges() {
    if !sysinfo::IS_SUPPORTED_SYSTEM {
        return;
    }
    let sample = sample();
    assert!(sample.cores >= 1);
    assert!((0.0..=100.0).contains(&sample.cpu_percent));
    assert!((0.0..=100.0).contains(&sample.app_cpu_percent));
    if let Some(renderer_cpu) = sample.renderer_cpu_percent {
        assert!((0.0..=100.0).contains(&renderer_cpu));
    }
    assert!(sample.mem_total_bytes > 0);
    assert!(sample.mem_used_bytes <= sample.mem_total_bytes);
    assert!(sample.app_mem_bytes > 0);
}

/// The `OnceLock` is shared, so a second call must reuse the primed handle
/// rather than rebuild (and re-sleep through) it.
#[test]
fn sampling_twice_stays_consistent() {
    if !sysinfo::IS_SUPPORTED_SYSTEM {
        return;
    }
    let first = sample();
    let second = sample();
    assert_eq!(first.cores, second.cores);
    assert_eq!(first.mem_total_bytes, second.mem_total_bytes);
}
