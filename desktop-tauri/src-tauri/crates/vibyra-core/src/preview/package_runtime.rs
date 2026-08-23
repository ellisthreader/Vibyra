use std::collections::HashSet;

use super::types::PreviewDeviceHint;

pub(crate) fn append_runtime_args(
    framework: &str,
    body: &str,
    args: &mut Vec<String>,
    env: &mut Vec<(String, String)>,
) {
    match framework {
        "React" => env.extend([
            ("HOST".into(), "127.0.0.1".into()),
            ("PORT".into(), "{port}".into()),
        ]),
        "Next.js" => args.extend([
            "--hostname".into(),
            "127.0.0.1".into(),
            "--port".into(),
            "{port}".into(),
        ]),
        "Expo web" => {
            if !body.contains("--web") {
                args.push("--web".into());
            }
            args.extend([
                "--host".into(),
                "localhost".into(),
                "--port".into(),
                "{port}".into(),
            ]);
        }
        "Ionic web" => {
            args.extend([
                "--host".into(),
                "127.0.0.1".into(),
                "--port".into(),
                "{port}".into(),
            ]);
            if !body.contains("--no-open") {
                args.push("--no-open".into());
            }
        }
        _ => args.extend([
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            "{port}".into(),
        ]),
    }
}

pub(crate) fn device_hint(deps: &HashSet<String>, framework: &str) -> PreviewDeviceHint {
    let mobile_web = framework == "Expo web"
        || framework == "Ionic web"
        || deps.contains("react-native")
        || deps.contains("react-native-web")
        || deps.contains("@capacitor/core")
        || deps.iter().any(|dep| dep.starts_with("@ionic/"));
    if mobile_web {
        PreviewDeviceHint::Phone
    } else if ["three", "phaser", "@babylonjs/core"]
        .iter()
        .any(|dep| deps.contains(*dep))
    {
        PreviewDeviceHint::Tv
    } else {
        PreviewDeviceHint::Laptop
    }
}
