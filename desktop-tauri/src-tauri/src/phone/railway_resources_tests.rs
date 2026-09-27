use super::*;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fixed_reads_do_not_expose_extra_provider_fields() {
        let result = read("read_file", &json!({"path":"projects.json"}), |args| {
            assert_eq!(args, ["list", "--json"]);
            Ok(r#"[{"id":"a","name":"demo","secret":"private"}]"#.into())
        })
        .unwrap();
        assert!(!result.to_string().contains("private"));
    }
    #[test]
    fn arbitrary_commands_and_paths_are_refused_without_running() {
        for path in [
            "../.env",
            "variables",
            "projects/--help.json",
            "projects-page-NaN.json",
        ] {
            assert!(read("read_file", &json!({"path":path}), |_| panic!(
                "must not run"
            ))
            .is_err());
        }
        assert!(read("write_file", &json!({"path":"README.md"}), |_| panic!()).is_err());
        assert!(redact("Authorization: Bearer secret").contains("redacted"));
        assert_eq!(redact("server started"), "server started");
    }
}

#[cfg(test)]
mod live {
    use super::*;
    use std::{process::Command, time::Duration};
    #[test]
    #[ignore = "Reads the current Mac Railway account; run explicitly for an authorized live audit"]
    fn railway_live_read_only_smoke() {
        let binary = crate::phone::railway::locate().expect("Railway installed");
        let run = |args: &[&str]| {
            crate::phone::railway::run(Command::new(&binary).args(args), Duration::from_secs(8))
                .ok_or_else(|| "Railway command failed".to_owned())
        };
        let result = read("read_file", &json!({"path":"projects.json"}), run).unwrap();
        let summary: Value = serde_json::from_str(result["content"].as_str().unwrap()).unwrap();
        assert!(summary["projects"].as_array().is_some());
        let raw: Value = serde_json::from_str(&run(&["list", "--json"]).unwrap()).unwrap();
        let project = raw
            .as_array()
            .unwrap()
            .iter()
            .find(|p| {
                p["name"]
                    .as_str()
                    .is_some_and(|n| n.starts_with("vibyra-demo"))
                    && p["services"]["edges"]
                        .as_array()
                        .is_some_and(|a| !a.is_empty())
            })
            .expect("Vibyra demo project");
        let id = project["id"].as_str().unwrap();
        let result = read(
            "read_file",
            &json!({"path":format!("projects/{id}.json")}),
            run,
        )
        .unwrap();
        let detail: Value = serde_json::from_str(result["content"].as_str().unwrap()).unwrap();
        let env = detail["environments"]["entries"][0]["id"].as_str().unwrap();
        let service = detail["services"]["entries"][0]["id"].as_str().unwrap();
        let prefix = format!("projects/{id}/environments/{env}/services/{service}");
        let result = read(
            "read_file",
            &json!({"path":format!("{prefix}/deployments.json")}),
            run,
        )
        .unwrap();
        let deployments: Value = serde_json::from_str(result["content"].as_str().unwrap()).unwrap();
        let deployment = deployments["deployments"][0]["id"]
            .as_str()
            .expect("A deployment to verify log reads");
        let result = read(
            "read_file",
            &json!({"path":format!("{prefix}/deployments/{deployment}/logs.txt")}),
            run,
        )
        .unwrap();
        assert!(result["content"].as_str().unwrap().len() <= 8192);
        eprintln!("Live project, environment/service, deployment and bounded log reads passed; provider contents omitted.");
    }
}
