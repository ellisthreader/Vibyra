use super::{fixture::fixture, *};

#[test]
fn unused_missing_rollout_starts_in_place_but_used_history_never_forks() {
    for used in [false, true] {
        let (dir, chats, session) = fixture();
        let id = session["id"].as_str().unwrap();
        if used {
            chats.local("turn.submit", json!({"sessionId":id,"submissionId":"55555555-5555-4555-a555-555555555555","text":"Keep this history"})).unwrap();
        }
        // The fixture replies asynchronously. Wait for its completed turn so
        // the baseline cannot race a legitimate result event after stop.
        if used {
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
            loop {
                let snapshot = chats
                    .local("conversation.snapshot", json!({"sessionId":id}))
                    .unwrap();
                if snapshot["items"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|item| item["kind"] == "result")
                {
                    break;
                }
                assert!(
                    std::time::Instant::now() < deadline,
                    "fixture turn did not finish"
                );
                std::thread::sleep(std::time::Duration::from_millis(5));
            }
        }
        chats
            .local("session.stop", json!({"sessionId":id}))
            .unwrap();
        let before = chats
            .remote(
                "phone",
                "conversation.snapshot",
                json!({"sessionId":id}),
                true,
            )
            .unwrap();
        std::fs::write(dir.path().join("missing-rollout"), "missing").unwrap();
        let result = chats.remote("phone", "conversation.resume", json!({"sessionId":id,"projectId":before["projectId"],"generation":before["generation"]}), true);
        let after = chats
            .remote(
                "phone",
                "conversation.snapshot",
                json!({"sessionId":id}),
                true,
            )
            .unwrap();
        assert_eq!(after["items"], before["items"]);
        assert_eq!(after["workingDirectory"], before["workingDirectory"]);
        assert_eq!(after["settings"], before["settings"]);
        let launches: Vec<Value> = std::fs::read_to_string(dir.path().join("launches"))
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        if used {
            assert!(result.unwrap_err().contains("no rollout found"));
            assert_eq!(launches.len(), 1);
            assert_eq!(after["processState"], "interrupted");
        } else {
            assert_eq!(result.unwrap()["id"], id);
            assert_eq!(after["processState"], "running");
            assert_eq!(launches.len(), 2);
            assert!(launches[1]["threadId"].is_null());
            assert_eq!(launches[1]["approvalPolicy"], "on-request");
            assert_eq!(launches[1]["sandbox"], "workspace-write");
            assert_eq!(launches[1]["model"], "fixture-model");
            assert!(!dir.path().join("effects").exists());
            chats
                .local("session.stop", json!({"sessionId":id}))
                .unwrap();
            chats
                .local("conversation.resume", json!({"sessionId":id}))
                .unwrap();
            let launches = std::fs::read_to_string(dir.path().join("launches")).unwrap();
            let last: Value = serde_json::from_str(launches.lines().last().unwrap()).unwrap();
            assert_eq!(last["threadId"], "new-unused-thread");
        }
        chats.shutdown();
    }
}
