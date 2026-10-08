use std::{env, path::PathBuf, process::Command};

pub fn build() {
    println!("cargo:rerun-if-changed=native/notifications");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let arch = if env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64") {
        "arm64"
    } else {
        "x86_64"
    };
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-module-name",
            "VibyraNotifications",
            "-target",
            &format!("{arch}-apple-macosx11.0"),
            "-O",
            "native/notifications/Notifications.swift",
            "-o",
        ])
        .arg(out.join("libVibyraNotifications.a"))
        .status()
        .expect("Run notification bridge compiler");
    assert!(status.success(), "Compile native notification bridge");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-lib=static=VibyraNotifications");
    println!("cargo:rustc-link-lib=framework=UserNotifications");
}
