use super::*;
use crate::agents::builtin_agents;

#[test]
fn every_installable_agent_is_in_the_catalog() {
    let ids: Vec<String> = builtin_agents().into_iter().map(|spec| spec.id).collect();
    for (id, _) in NPM {
        assert!(ids.iter().any(|known| known == id), "{id} is not an agent");
    }
    for (id, _, _) in MANUAL {
        assert!(ids.iter().any(|known| known == id), "{id} is not an agent");
    }
}

#[test]
fn every_optional_agent_says_how_it_is_installed() {
    // A row that can only say "not installed" and never how is the thing this
    // table exists to end.
    for spec in builtin_agents() {
        if spec.id == "shell" {
            continue;
        }
        assert!(
            install_hint(&spec.id).is_some(),
            "{} has no install hint",
            spec.id
        );
    }
}

#[test]
fn only_npm_agents_are_ones_vibyra_runs_itself() {
    assert_eq!(npm_package("codex"), Some("@openai/codex"));
    // Aider is a Python package; offering an npm button for it would fail on
    // every machine.
    assert_eq!(npm_package("aider"), None);
    assert_eq!(
        install_hint("aider").unwrap().manager,
        InstallManager::Manual
    );
    assert!(install_hint("aider")
        .unwrap()
        .command
        .contains("pip install"));
}

#[test]
fn a_manual_hint_still_carries_the_whole_command() {
    for (id, _, _) in MANUAL {
        let hint = install_hint(id).unwrap();
        assert!(
            hint.command.contains(hint.package),
            "{id} command omits its package"
        );
    }
}

#[test]
fn nothing_outside_the_catalog_claims_an_installer() {
    assert!(install_hint("definitely-not-an-agent").is_none());
    assert!(npm_package("shell").is_none());
}
