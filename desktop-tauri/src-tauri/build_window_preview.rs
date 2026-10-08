use std::{env, path::PathBuf, process::Command};

pub fn build() {
    println!("cargo:rerun-if-changed=native/window-preview");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("macos") {
        return;
    }
    let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let arch = if env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("aarch64") {
        "arm64"
    } else {
        "x86_64"
    };
    let files = [
        "Inventory.swift",
        "Capture.swift",
        "Input.swift",
        "InputAuthority.swift",
        "Front.swift",
        "FocusFields.swift",
        "FocusScan.swift",
        "Focus.swift",
        "Keys.swift",
        "Bridge.swift",
    ];
    let status = Command::new("xcrun")
        .args([
            "swiftc",
            "-parse-as-library",
            "-emit-library",
            "-static",
            "-module-name",
            "VibyraWindowPreview",
            "-target",
            &format!("{arch}-apple-macosx11.0"),
            "-Xfrontend",
            "-disable-autolink-framework",
            "-Xfrontend",
            "ScreenCaptureKit",
            "-O",
        ])
        .args(files.map(|file| format!("native/window-preview/{file}")))
        .arg("-o")
        .arg(out.join("libVibyraWindowPreview.a"))
        .status()
        .expect("Run Swift compiler");
    assert!(status.success(), "Compile native window Preview");
    println!("cargo:rustc-link-search=native={}", out.display());
    println!("cargo:rustc-link-search=native=/usr/lib/swift");
    let compiler = Command::new("xcrun")
        .args(["--find", "swiftc"])
        .output()
        .expect("Find Swift compiler");
    let compiler = PathBuf::from(String::from_utf8(compiler.stdout).unwrap().trim());
    let toolchain = compiler.parent().unwrap().parent().unwrap();
    println!(
        "cargo:rustc-link-search=native={}",
        toolchain.join("lib/swift/macosx").display()
    );
    println!("cargo:rustc-link-lib=static=VibyraWindowPreview");
    for name in ["AppKit", "CoreImage", "CoreMedia", "CoreVideo", "ImageIO"] {
        println!("cargo:rustc-link-lib=framework={name}");
    }
    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    println!("cargo:rustc-link-arg=-Wl,-weak_framework,ScreenCaptureKit");
}
