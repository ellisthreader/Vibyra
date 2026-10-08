//! Send one checked OS event at a time; release only successfully emitted downs.
use crate::window_preview::InputCheck;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
    KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_RIGHTDOWN,
    MOUSEEVENTF_RIGHTUP, MOUSEINPUT, MOUSE_EVENT_FLAGS, VIRTUAL_KEY,
};

fn emit(input: INPUT) -> Result<(), String> {
    // SAFETY: initialized INPUT constructed by this private adapter.
    if unsafe { SendInput(&[input], std::mem::size_of::<INPUT>() as i32) } != 1 {
        return Err("Windows blocked the input.".into());
    }
    Ok(())
}

fn release(input: INPUT) -> Option<INPUT> {
    // SAFETY: type selects the initialized union member.
    unsafe {
        if input.r#type == INPUT_KEYBOARD {
            let mut value = input.Anonymous.ki;
            if value.dwFlags.contains(KEYEVENTF_KEYUP) {
                return None;
            }
            value.dwFlags |= KEYEVENTF_KEYUP;
            return Some(INPUT {
                r#type: INPUT_KEYBOARD,
                Anonymous: INPUT_0 { ki: value },
            });
        }
        if input.r#type == INPUT_MOUSE {
            let mut value = input.Anonymous.mi;
            value.dwFlags = if value.dwFlags == MOUSEEVENTF_LEFTDOWN {
                MOUSEEVENTF_LEFTUP
            } else if value.dwFlags == MOUSEEVENTF_RIGHTDOWN {
                MOUSEEVENTF_RIGHTUP
            } else {
                return None;
            };
            return Some(INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 { mi: value },
            });
        }
    }
    None
}

fn is_release(input: INPUT) -> bool {
    // SAFETY: type selects the initialized union member.
    unsafe {
        (input.r#type == INPUT_KEYBOARD && input.Anonymous.ki.dwFlags.contains(KEYEVENTF_KEYUP))
            || (input.r#type == INPUT_MOUSE
                && (input.Anonymous.mi.dwFlags == MOUSEEVENTF_LEFTUP
                    || input.Anonymous.mi.dwFlags == MOUSEEVENTF_RIGHTUP))
    }
}

fn matches(left: INPUT, right: INPUT) -> bool {
    if left.r#type != right.r#type {
        return false;
    }
    // SAFETY: both records have the same initialized member.
    unsafe {
        if left.r#type == INPUT_KEYBOARD {
            let (a, b) = (left.Anonymous.ki, right.Anonymous.ki);
            a.wVk == b.wVk && a.wScan == b.wScan && a.dwFlags == b.dwFlags
        } else {
            left.Anonymous.mi.dwFlags == right.Anonymous.mi.dwFlags
        }
    }
}

pub(super) fn send_checked(inputs: &[INPUT], check: &InputCheck<'_>) -> Result<(), String> {
    let mut held = Vec::new();
    let result = (|| {
        for &input in inputs {
            if is_release(input) {
                let expected = held.last().ok_or("Unpaired input release")?;
                if !matches(*expected, input) {
                    return Err("Mismatched input release".into());
                }
                emit(input)?;
                held.pop();
            } else {
                check()?;
                emit(input)?;
                if let Some(up) = release(input) {
                    held.push(up);
                }
            }
        }
        Ok(())
    })();
    // Authorization ending must not leave a modifier/button pressed.
    for up in held.into_iter().rev() {
        let _ = emit(up);
    }
    result
}

pub(super) fn mouse(flags: MOUSE_EVENT_FLAGS, data: i32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                mouseData: data as u32,
                dwFlags: flags,
                ..Default::default()
            },
        },
    }
}

pub(super) fn key(code: VIRTUAL_KEY, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: code,
                wScan: scan,
                dwFlags: flags,
                ..Default::default()
            },
        },
    }
}
