//! AT-SPI, the Linux accessibility bus. GTK, Qt, Chromium/Electron and
//! WebKitGTK publish their trees there once accessibility is switched on,
//! which is what a screen reader does too.

use dbus::blocking::stdintf::org_freedesktop_dbus::Properties;
use dbus::blocking::Connection;
use dbus::Path;
use std::collections::HashMap;
use std::time::{Duration, Instant};

pub(super) use super::atspi_codes::{bits, has, role, state};

const TIMEOUT: Duration = Duration::from_millis(250);
const ROOT: &str = "/org/a11y/atspi/accessible/root";
const ACCESSIBLE: &str = "org.a11y.atspi.Accessible";

/// An accessible object: its application's bus name and its path.
pub(super) type Object = (String, Path<'static>);

/// The accessibility bus, asking toolkits to publish their trees.
pub(super) fn connect() -> Result<Connection, String> {
    let session = Connection::new_session().map_err(|e| e.to_string())?;
    let bus = session.with_proxy("org.a11y.Bus", "/org/a11y/bus", TIMEOUT);
    let (address,): (String,) = bus
        .method_call("org.a11y.Bus", "GetAddress", ())
        .map_err(|e| e.to_string())?;
    let _ = bus.set("org.a11y.Status", "IsEnabled", true);
    let mut channel = dbus::channel::Channel::open_private(&address).map_err(|e| e.to_string())?;
    channel.register().map_err(|e| e.to_string())?;
    Ok(Connection::from(channel))
}

/// The applications belonging to `pid`: its web-content child processes first
/// (WebKitGTK draws pages in one), then the process itself.
pub(super) fn applications(bus: &Connection, pid: u32) -> Vec<Object> {
    let registry = bus.with_proxy("org.a11y.atspi.Registry", ROOT, TIMEOUT);
    let Ok((children,)) =
        registry.method_call::<(Vec<Object>,), _, _, _>(ACCESSIBLE, "GetChildren", ())
    else {
        return Vec::new();
    };
    let daemon = bus.with_proxy("org.freedesktop.DBus", "/org/freedesktop/DBus", TIMEOUT);
    let mut ours: Vec<(bool, Object)> = children
        .into_iter()
        .filter_map(|(name, path)| {
            let (owner,): (u32,) = daemon
                .method_call(
                    "org.freedesktop.DBus",
                    "GetConnectionUnixProcessID",
                    (name.as_str(),),
                )
                .ok()?;
            let child = parent(owner) == Some(pid);
            (owner == pid || child).then_some((child, (name, path)))
        })
        .collect();
    ours.sort_by_key(|(child, _)| !child);
    ours.into_iter().map(|(_, app)| app).collect()
}

fn parent(pid: u32) -> Option<u32> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // "pid (name) state ppid ...": the name may hold spaces and parentheses.
    stat.rsplit_once(')')?
        .1
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()
}

/// Objects in `app` holding every state in `states` and (when given) one of
/// `roles`. Collection when the toolkit has it (GTK, Chromium); otherwise a
/// walk bounded in objects and time (Qt).
pub(super) fn matches(
    bus: &Connection,
    app: &Object,
    states: &[u32],
    roles: &[u32],
    count: usize,
) -> Vec<Object> {
    const ALL: i32 = 1;
    const ANY: i32 = 2;
    let rule = (
        bits(states, 2),
        ALL,
        HashMap::<String, String>::new(),
        ALL,
        bits(roles, 4),
        if roles.is_empty() { ALL } else { ANY },
        Vec::<String>::new(),
        ALL,
        false,
    );
    let proxy = bus.with_proxy(app.0.as_str(), app.1.clone(), TIMEOUT);
    if let Ok((found,)) = proxy.method_call::<(Vec<Object>,), _, _, _>(
        "org.a11y.atspi.Collection",
        "GetMatches",
        (rule, 0u32, count as i32, true),
    ) {
        return found;
    }
    walk(bus, app, count, |object| {
        let words = object_states(bus, object);
        states.iter().all(|state| has(&words, *state))
            && (roles.is_empty()
                || object_role(bus, object).is_some_and(|role| roles.contains(&role)))
    })
}

fn walk(
    bus: &Connection,
    app: &Object,
    count: usize,
    wanted: impl Fn(&Object) -> bool,
) -> Vec<Object> {
    let deadline = Instant::now() + Duration::from_millis(60);
    let (mut pending, mut found, mut seen) = (vec![app.clone()], Vec::new(), 0);
    while let Some(object) = pending.pop() {
        seen += 1;
        if seen > 400 || found.len() >= count || Instant::now() > deadline {
            break;
        }
        if wanted(&object) {
            found.push(object.clone());
        }
        let proxy = bus.with_proxy(object.0.as_str(), object.1.clone(), TIMEOUT);
        if let Ok((children,)) =
            proxy.method_call::<(Vec<Object>,), _, _, _>(ACCESSIBLE, "GetChildren", ())
        {
            pending.extend(children.into_iter().take(200).rev());
        }
    }
    found
}

pub(super) fn object_states(bus: &Connection, object: &Object) -> Vec<u32> {
    let proxy = bus.with_proxy(object.0.as_str(), object.1.clone(), TIMEOUT);
    proxy
        .method_call::<(Vec<u32>,), _, _, _>(ACCESSIBLE, "GetState", ())
        .map(|(words,)| words)
        .unwrap_or_default()
}

pub(super) fn object_role(bus: &Connection, object: &Object) -> Option<u32> {
    let proxy = bus.with_proxy(object.0.as_str(), object.1.clone(), TIMEOUT);
    proxy
        .method_call::<(u32,), _, _, _>(ACCESSIBLE, "GetRole", ())
        .ok()
        .map(|(role,)| role)
}

/// On-screen extents, as `[x, y, width, height]`.
pub(super) fn extents(bus: &Connection, object: &Object) -> Option<[f64; 4]> {
    let proxy = bus.with_proxy(object.0.as_str(), object.1.clone(), TIMEOUT);
    let ((x, y, width, height),): ((i32, i32, i32, i32),) = proxy
        .method_call("org.a11y.atspi.Component", "GetExtents", (0u32,))
        .ok()?;
    (width > 0 && height > 0).then_some([x as f64, y as f64, width as f64, height as f64])
}

/// Where the text cursor is, from the Text interface.
pub(super) fn caret(bus: &Connection, object: &Object) -> Option<[f64; 4]> {
    let proxy = bus.with_proxy(object.0.as_str(), object.1.clone(), TIMEOUT);
    let offset: i32 = proxy.get("org.a11y.atspi.Text", "CaretOffset").ok()?;
    let (x, y, _, height): (i32, i32, i32, i32) = proxy
        .method_call("org.a11y.atspi.Text", "GetCharacterExtents", (offset, 0u32))
        .ok()?;
    (height > 0).then_some([x as f64, y as f64, 1.0, height as f64])
}

pub(super) fn name(bus: &Connection, object: &Object) -> String {
    let proxy = bus.with_proxy(object.0.as_str(), object.1.clone(), TIMEOUT);
    proxy.get::<String>(ACCESSIBLE, "Name").unwrap_or_default()
}
