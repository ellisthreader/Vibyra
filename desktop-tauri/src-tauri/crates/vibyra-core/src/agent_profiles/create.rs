use super::place_store::insert_place;
use super::{clean_name, home_for, AgentProfile, NewAgent};
use crate::agent_model::PlaceAccess;
use crate::agentdb::ids::now_ms;
use crate::agentdb::{sql, AgentDb};
use crate::error::CoreResult;
use rusqlite::params;
use std::path::Path;

pub fn create(
    db: &AgentDb,
    account: &str,
    root: &Path,
    request: NewAgent,
) -> CoreResult<AgentProfile> {
    create_once(db, account, root, request, None)
}

/// Creates a teammate, its private home, and the read/write grant over it.
///
/// Prepare the managed home before committing the profile, grant and receipt
/// together. If the transaction fails, retry reuses that reserved directory.
pub fn create_once(
    db: &AgentDb,
    account: &str,
    data_root: &Path,
    request: NewAgent,
    token: Option<&str>,
) -> CoreResult<AgentProfile> {
    let name = clean_name(&request.name)?;
    let id = crate::agentdb::requests::stable_id(account, token)?;
    let home = super::managed_home(data_root, &id)?;
    let now = now_ms();
    let profile = AgentProfile {
        id: id.clone(),
        account: account.to_string(),
        name,
        brief: request.brief.trim().to_string(),
        engine: request.engine,
        model: None,
        effort: None,
        permission: crate::agent_model::PermissionMode::Standard,
        memory_budget: 4_000,
        reflection: crate::agent_model::Reflection::Suggest,
        home_path: home.to_string_lossy().into_owned(),
        accent: String::new(),
        mail_enabled: false,
        routines_allowed: true,
        created_ms: now,
        updated_ms: now,
        archived_ms: None,
    };
    let result = crate::agentdb::requests::once(
        db,
        account,
        "agent.create",
        token,
        &request,
        |connection| {
            home_for(data_root, &id)?;
            connection
                .execute(
                    "INSERT INTO agent_profiles (id, account, name, brief, engine, permission, \
                 memory_budget, reflection, home_path, created_ms, updated_ms) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                    params![
                        profile.id,
                        profile.account,
                        profile.name,
                        profile.brief,
                        profile.engine.as_str(),
                        profile.permission.as_str(),
                        profile.memory_budget,
                        profile.reflection.as_str(),
                        profile.home_path,
                        now,
                    ],
                )
                .map_err(sql)?;
            insert_place(
                connection,
                &profile.id,
                &profile.home_path,
                PlaceAccess::ReadWrite,
                "Agent home",
                now,
            )?;
            Ok(profile.clone())
        },
    );
    // A failed transaction may leave an empty reserved home. Its stable ID
    // makes retries reuse it. Never remove it here: another request may have
    // committed that same home as soon as the transaction lock was released.
    result
}
