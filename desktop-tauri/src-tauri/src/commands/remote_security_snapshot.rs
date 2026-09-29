use super::*;

pub(super) async fn load(state: &AppState) -> Result<Value, String> {
    let context = Context::capture(state, None)?;
    let computers = context
        .request(state, Method::GET, "/api/remote/hosts", None)
        .await?;
    let computer = computers["computers"]
        .as_array()
        .and_then(|hosts| {
            hosts
                .iter()
                .find(|host| host["id"] == context.scope.host_id)
        })
        .cloned();
    let registered = computer.is_some();
    let (pending, waiting, policy) = if !registered {
        (
            json!({"devices":[]}),
            json!({"sessions":[]}),
            json!({"security":null}),
        )
    } else {
        let base = format!("/api/remote/hosts/{}", context.scope.host_id);
        (
            context
                .request(state, Method::GET, &format!("{base}/devices/pending"), None)
                .await?,
            context
                .request(
                    state,
                    Method::GET,
                    &format!("{base}/sessions/pending"),
                    None,
                )
                .await?,
            context
                .request(state, Method::GET, &format!("{base}/security"), None)
                .await?,
        )
    };
    let devices = context
        .request(state, Method::GET, "/api/security/devices", None)
        .await?;
    let sessions = context
        .request(state, Method::GET, "/api/remote/sessions", None)
        .await?;
    let passkeys = context
        .request(state, Method::GET, "/api/security/passkeys", None)
        .await?;
    let activity = context
        .request(state, Method::GET, "/api/security/events", None)
        .await?;
    context.check(state)?;
    Ok(
        json!({"scope":context.scope,"computer":computer,"pendingDevices":pending["devices"],"pendingSessions":waiting["sessions"],
        "security":policy["security"],"passkeys":passkeys["passkeys"],"devices":devices["devices"],"sessions":sessions["sessions"],"events":activity["events"]}),
    )
}
