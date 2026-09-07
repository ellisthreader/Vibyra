use super::*;
#[cfg(unix)]
use crate::agent_mode::gate::test_world::world;
#[cfg(unix)]
use std::time::Duration;
#[cfg(unix)]
use vibyra_core::agent_runtime::deadline::Deadline;

#[cfg(unix)]
fn exercise(wrong_profile: bool, resumed: bool) -> (Result<TurnExit, String>, Vec<AgentEvent>) {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let (world, chat_id) = world(&root);
    let mut chat = vibyra_core::agent_chats::get(&world.db, &world.account, &chat_id).unwrap();
    chat.engine = vibyra_core::agent_model::Engine::Codex;
    if resumed {
        chat.session_id = Some("thread-1".into());
    }
    let mut task =
        vibyra_core::agent_runs::get(&world.db, &world.account, &format!("turn-{chat_id}"))
            .unwrap();
    task.spec.effort = Some("low".into());
    let program = root.path().join("codex");
    std::fs::write(&program, include_str!("fixture.py")).unwrap();
    std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o700)).unwrap();
    let mut env = vec![
        ("PATH".into(), root.path().to_string_lossy().into_owned()),
        (
            "CODEX_HOME".into(),
            root.path().to_string_lossy().into_owned(),
        ),
    ];
    if wrong_profile {
        env.push(("FIXTURE_WRONG_PROFILE".into(), "1".into()));
    }
    let command = TurnCommand {
        program: "codex".into(),
        args: vec![],
        cwd: task.spec.cwd.clone(),
        env,
        env_remove: vec![],
        prompt: "Review the fixture".into(),
    };
    let handle = TurnHandle::new();
    let _deadline = Deadline::start(handle.clone(), Duration::from_secs(5));
    let bridge = PermissionBridge {
        exe: program,
        port: 1,
        token: "fixture".into(),
        chat_id,
        turn_id: task.id.clone(),
    };
    let mut events = Vec::new();
    let outcome = run(
        ServerTurn {
            chat: &chat,
            task: &task,
            images: &[],
            bridge: &bridge,
            handle: &handle,
            state_root: root.path(),
        },
        command,
        |event| events.push(event),
        |_, _, _| Ok(()),
    );
    (outcome, events)
}
#[cfg(unix)]
#[test]
fn fresh_and_resumed_tasks_preserve_early_events_and_confirm_completion() {
    for resumed in [false, true] {
        let (result, events) = exercise(false, resumed);
        assert_eq!(result.unwrap(), TurnExit::Completed);
        assert!(events.iter().any(
            |e| matches!(e,AgentEvent::AssistantCompleted{text} if text=="Fixture task complete.")
        ));
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, AgentEvent::UsageUpdated { .. }))
                .count(),
            1
        );
        assert!(matches!(
            events.last(),
            Some(AgentEvent::TurnCompleted { .. })
        ));
    }
}
#[cfg(unix)]
#[test]
fn a_provider_that_ignores_the_profile_never_starts_work() {
    let (result, events) = exercise(true, false);
    assert!(result.unwrap_err().contains("permission profile"));
    assert!(events.is_empty());
}
#[test]
fn broader_permissions_and_network_escalations_are_declined() {
    let bridge = PermissionBridge {
        exe: "unused".into(),
        port: 1,
        token: "unused".into(),
        chat_id: "c".into(),
        turn_id: "t".into(),
    };
    for params in [
        json!({"additionalPermissions":{"filesystem":{"write":["/home"]}}}),
        json!({"networkApprovalContext":{"host":"example.com"}}),
    ] {
        assert_eq!(
            approval::respond("item/commandExecution/requestApproval", &params, &bridge)
                ["decision"],
            "decline"
        );
    }
}

#[test]
fn integration_dynamic_tool_uses_the_same_native_gate() {
    use crate::agent_mode::bridge::wire::{BridgeReply, BridgeRequest};
    use std::io::{BufRead, BufReader, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut line = String::new();
        BufReader::new(stream.try_clone().unwrap())
            .read_line(&mut line)
            .unwrap();
        let request: BridgeRequest = serde_json::from_str(&line).unwrap();
        writeln!(
            stream,
            "{}",
            serde_json::to_string(&BridgeReply::allow(serde_json::json!({"accounts":[]}))).unwrap()
        )
        .unwrap();
        request
    });
    let bridge = vibyra_core::agent_runtime::PermissionBridge {
        exe: "/fixture".into(),
        port,
        token: "private-turn-token".into(),
        chat_id: "chat-a".into(),
        turn_id: "turn-a".into(),
    };
    let response = super::approval::respond(
        "item/tool/call",
        &serde_json::json!({
            "tool":"integration_accounts", "callId":"call-a", "arguments":{}
        }),
        &bridge,
    );
    assert_eq!(response["success"], true);
    let request = server.join().unwrap();
    assert_eq!(request.tool_name, "integration_accounts");
    assert_eq!(request.token, bridge.token);
    assert_eq!(request.chat_id, bridge.chat_id);
    assert_eq!(request.turn_id, bridge.turn_id);
    assert_eq!(request.tool_use_id.as_deref(), Some("call-a"));
}
