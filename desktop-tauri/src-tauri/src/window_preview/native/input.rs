//! The small set of input the phone may send, validated exactly as the Mac
//! adapter validates it.

use super::backend::Geometry;
use serde_json::Value;

/// Keys by meaning, never letter shortcuts: a letter with Ctrl or Command
/// could close or quit the application, and letters move between layouts.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Key {
    Enter,
    Tab,
    ShiftTab,
    Escape,
    Backspace,
    Delete,
    Left,
    Right,
    Up,
    Down,
    PageUp,
    PageDown,
}

impl Key {
    fn named(name: &str) -> Option<Self> {
        Some(match name {
            "enter" => Self::Enter,
            "tab" => Self::Tab,
            "shiftTab" => Self::ShiftTab,
            "escape" => Self::Escape,
            "backspace" => Self::Backspace,
            "delete" => Self::Delete,
            "left" => Self::Left,
            "right" => Self::Right,
            "up" => Self::Up,
            "down" => Self::Down,
            "pageUp" => Self::PageUp,
            "pageDown" => Self::PageDown,
            _ => return None,
        })
    }
}

/// One step of live typing from the phone.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Action {
    Text(Vec<u16>),
    Key(Key, u8),
}

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum InputEvent {
    Click { x: f64, y: f64, right: bool },
    Scroll { x: f64, y: f64, delta: i32 },
    Text(Vec<u16>),
    Key(Key),
    Keys(Vec<Action>),
}

const MAX_ACTIONS: usize = 64;
const MAX_TEXT: usize = 512;
const MAX_REPEAT: u64 = 200;

impl InputEvent {
    pub fn parse(request: &Value) -> Result<Self, String> {
        let unit = |key: &str| {
            request[key]
                .as_f64()
                .filter(|value| value.is_finite() && (0.0..=1.0).contains(value))
        };
        match request["kind"].as_str() {
            Some(kind @ ("click" | "scroll")) => {
                let (Some(x), Some(y)) = (unit("x"), unit("y")) else {
                    return Err("Invalid window coordinates.".into());
                };
                Ok(if kind == "scroll" {
                    let delta = request["delta"].as_i64().unwrap_or(0).clamp(-600, 600) as i32;
                    Self::Scroll { x, y, delta }
                } else {
                    Self::Click {
                        x,
                        y,
                        right: request["right"] == true,
                    }
                })
            }
            Some("text") => Ok(Self::Text(text(&request["text"], &mut 0)?)),
            Some("key") => request["key"]
                .as_str()
                .and_then(Key::named)
                .map(Self::Key)
                .ok_or_else(|| "Unsupported key.".into()),
            Some("keys") => {
                let actions = request["actions"]
                    .as_array()
                    .map(Vec::as_slice)
                    .unwrap_or(&[]);
                if actions.is_empty() || actions.len() > MAX_ACTIONS {
                    return Err("Send between 1 and 64 key actions at once.".into());
                }
                let mut units = 0;
                // Every action is checked before any is sent.
                actions
                    .iter()
                    .map(|action| action_from(action, &mut units))
                    .collect::<Result<_, _>>()
                    .map(Self::Keys)
            }
            _ => Err("Unsupported window input.".into()),
        }
    }
}

fn text(value: &Value, total: &mut usize) -> Result<Vec<u16>, String> {
    let units = value
        .as_str()
        .unwrap_or("")
        .encode_utf16()
        .collect::<Vec<_>>();
    *total += units.len();
    if units.is_empty() || *total > MAX_TEXT {
        return Err("Enter at most 512 characters at once.".into());
    }
    Ok(units)
}

fn action_from(action: &Value, units: &mut usize) -> Result<Action, String> {
    if action.get("text").is_some() {
        return text(&action["text"], units).map(Action::Text);
    }
    let key = action["key"]
        .as_str()
        .and_then(Key::named)
        .ok_or("Unsupported key.")?;
    let times = action.get("repeat").map_or(Some(1), Value::as_u64);
    match times {
        Some(times @ 1..=MAX_REPEAT) => Ok(Action::Key(key, times as u8)),
        _ => Err("Unsupported key repeat.".into()),
    }
}

/// Where a normalised phone coordinate lands on the desktop.
#[allow(dead_code)]
pub(crate) fn point(window: &Geometry, x: f64, y: f64) -> (f64, f64) {
    (window.x + x * window.width, window.y + y * window.height)
}
