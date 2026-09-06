use super::*;
use crate::agent_mode::gate::test_world::world;
use vibyra_core::{
    agent_chats, agent_mail,
    agent_model::{ChatSource, Engine},
    agent_profiles,
};

#[test]
fn child_failure_and_cancellation_return_durable_parent_receipts() {
    for status in [RunStatus::Failed, RunStatus::Cancelled] {
        let tmp = tempfile::tempdir().unwrap();
        let (world, parent_chat) = world(&tmp);
        let sender = agent_chats::get(&world.db, &world.account, &parent_chat)
            .unwrap()
            .agent_id
            .unwrap();
        let recipient = agent_profiles::create(
            &world.db,
            &world.account,
            &world.root,
            agent_profiles::NewAgent {
                name: "Reviewer".into(),
                brief: String::new(),
                engine: Engine::Claude,
            },
        )
        .unwrap();
        agent_mail::set_allowlist(&world.db, &sender, std::slice::from_ref(&recipient.id)).unwrap();
        let delivery = agent_mail::send(
            &world.db,
            false,
            agent_mail::Handoff {
                sender_id: sender,
                sender_name: "Nia".into(),
                recipient_id: recipient.id.clone(),
                body: "Review this output and return findings.".into(),
                parent_id: None,
            },
            &recipient.name,
            true,
        )
        .unwrap();
        let agent_mail::Delivery::Delivered(mail) = delivery else {
            panic!("handoff should be admitted");
        };
        let parent = format!("turn-{parent_chat}");
        agent_mail::link_task(
            &world.db,
            &mail.id,
            Some(&parent),
            "Findings with source references",
        )
        .unwrap();
        let child = agent_chats::create(
            &world.db,
            &world.account,
            agent_chats::NewChat {
                agent_id: Some(recipient.id.clone()),
                engine: recipient.engine,
                title: String::new(),
                source: ChatSource::Handoff,
            },
        )
        .unwrap();
        agent_mail::attach_chat(&world.db, &mail.id, &child.id).unwrap();
        record(
            &world,
            &mail.id,
            &child.id,
            agent_mail::task_link(&world.db, &mail.id).unwrap(),
            Ok(RunOutcome {
                status,
                message: Some("Fixture terminal outcome".into()),
            }),
        )
        .unwrap();
        let rows = agent_runs::artifact_list(&world.db, &world.account, &parent).unwrap();
        let receipt: serde_json::Value = serde_json::from_str(&rows[0].content).unwrap();
        assert_eq!(receipt["outcome"]["status"], status.as_str());
        assert_eq!(receipt["parentRunId"], parent);
        assert_eq!(receipt["childChatId"], child.id);
        assert_eq!(
            agent_mail::trail(&world.db, &recipient.id, 10).unwrap()[0].status,
            status.as_str()
        );
        assert!(agent_runs::artifact_list(&world.db, "another-account", &parent).is_err());
    }
}
