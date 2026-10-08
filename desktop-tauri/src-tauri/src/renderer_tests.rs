use super::*;

#[test]
fn parses_known_modes_and_falls_back_to_auto() {
    assert_eq!(
        RendererMode::parse("accelerated"),
        RendererMode::Accelerated
    );
    assert_eq!(
        RendererMode::parse("  Compatibility "),
        RendererMode::Compatibility
    );
    assert_eq!(RendererMode::parse("auto"), RendererMode::Auto);
    assert_eq!(RendererMode::parse(""), RendererMode::Auto);
    assert_eq!(RendererMode::parse("nonsense"), RendererMode::Auto);
}

#[test]
fn mode_round_trips_through_its_wire_value() {
    for mode in [
        RendererMode::Auto,
        RendererMode::Accelerated,
        RendererMode::Compatibility,
    ] {
        assert_eq!(RendererMode::parse(mode.as_str()), mode);
    }
}

#[cfg(target_os = "linux")]
mod detection {
    use super::super::*;

    fn facts(module: bool, vendor: Option<&str>, offload: bool) -> GpuFacts {
        GpuFacts {
            nvidia_module: module,
            primary_vendor: vendor.map(str::to_owned),
            nvidia_offload: offload,
        }
    }

    #[test]
    fn machines_without_the_nvidia_module_keep_the_accelerated_path() {
        assert!(!nvidia_drives_session(&facts(false, Some("0x10de"), false)));
        assert!(!nvidia_drives_session(&facts(false, None, true)));
    }

    #[test]
    fn nvidia_as_the_boot_gpu_takes_the_shared_memory_path() {
        assert!(nvidia_drives_session(&facts(true, Some("0x10de"), false)));
    }

    #[test]
    fn hybrid_laptops_rendering_on_the_igpu_keep_the_accelerated_path() {
        // NVIDIA module loaded, but Intel/AMD brings up the session.
        assert!(!nvidia_drives_session(&facts(true, Some("0x8086"), false)));
        assert!(!nvidia_drives_session(&facts(true, Some("0x1002"), false)));
    }

    #[test]
    fn prime_offload_overrides_a_non_nvidia_boot_gpu() {
        assert!(nvidia_drives_session(&facts(true, Some("0x8086"), true)));
    }

    #[test]
    fn unreadable_topology_stays_conservative() {
        // Guessing wrong towards acceleration freezes windows; guessing wrong the
        // other way only costs CPU, so an unknown topology takes the safe path.
        assert!(nvidia_drives_session(&facts(true, None, false)));
    }

    #[test]
    fn explicit_modes_override_detection_in_both_directions() {
        let nvidia = facts(true, Some("0x10de"), false);
        let intel = facts(true, Some("0x8086"), false);
        assert!(!use_shared_memory(RendererMode::Accelerated, &nvidia));
        assert!(use_shared_memory(RendererMode::Compatibility, &intel));
        assert!(use_shared_memory(RendererMode::Auto, &nvidia));
        assert!(!use_shared_memory(RendererMode::Auto, &intel));
    }
}

#[cfg(target_os = "linux")]
mod topology {
    use std::path::{Path, PathBuf};

    fn scratch(name: &str) -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("vibyra-renderer-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("scratch drm root");
        root
    }

    fn card(root: &Path, name: &str, boot_vga: Option<&str>, vendor: Option<&str>) {
        let device = root.join(name).join("device");
        std::fs::create_dir_all(&device).expect("card device dir");
        if let Some(flag) = boot_vga {
            std::fs::write(device.join("boot_vga"), format!("{flag}\n")).expect("boot_vga");
        }
        if let Some(id) = vendor {
            std::fs::write(device.join("vendor"), format!("{id}\n")).expect("vendor");
        }
    }

    #[test]
    fn reads_the_vendor_of_the_boot_vga_card() {
        let root = scratch("boot");
        card(&root, "card0", Some("0"), Some("0x10DE"));
        card(&root, "card1", Some("1"), Some("0x8086"));
        assert_eq!(
            super::probe::primary_gpu_vendor(&root).as_deref(),
            Some("0x8086")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn skips_cards_without_a_pci_device_link() {
        let root = scratch("render");
        card(&root, "renderD128", None, None);
        card(&root, "card0", Some("1"), Some("0x10de"));
        assert_eq!(
            super::probe::primary_gpu_vendor(&root).as_deref(),
            Some("0x10de")
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn reports_nothing_when_no_card_is_marked_primary() {
        let root = scratch("none");
        card(&root, "card0", Some("0"), Some("0x10de"));
        assert!(super::probe::primary_gpu_vendor(&root).is_none());
        let _ = std::fs::remove_dir_all(&root);
    }
}
