//! The window's visible text boxes as UI Automation lists them, so the phone
//! can raise its keyboard in the same touch as a tap on one.

use super::automation::{bounds, read_only, with};
use super::inventory::{dpi_aware, hwnd};
use super::{Field, Geometry};
use crate::window_preview::native::kind;
use std::mem::ManuallyDrop;
use windows::core::BOOL;
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Variant::{VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_I4};
use windows::Win32::UI::Accessibility::{
    IUIAutomation, TreeScope_Descendants, UIA_ControlTypePropertyId, UIA_EditControlTypeId,
};

pub(super) fn fields(window: &Geometry) -> Vec<Field> {
    dpi_aware();
    with(|automation| unsafe { list(automation, hwnd(window.info.id)) }).unwrap_or_default()
}

unsafe fn list(automation: &IUIAutomation, handle: HWND) -> Option<Vec<Field>> {
    let root = automation.ElementFromHandle(handle).ok()?;
    // Password boxes are edits too; read-only ones are left out below.
    let edit = VARIANT {
        Anonymous: VARIANT_0 {
            Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                vt: VT_I4,
                Anonymous: VARIANT_0_0_0 {
                    lVal: UIA_EditControlTypeId.0,
                },
                ..Default::default()
            }),
        },
    };
    let condition = automation
        .CreatePropertyCondition(UIA_ControlTypePropertyId, &edit)
        .ok()?;
    let found = root.FindAll(TreeScope_Descendants, &condition).ok()?;
    let count = found.Length().unwrap_or(0).clamp(0, 96);
    Some(
        (0..count)
            .filter_map(|index| found.GetElement(index).ok())
            .filter(|element| !element.CurrentIsOffscreen().is_ok_and(BOOL::as_bool))
            .filter(|element| read_only(element) != Some(true))
            .filter_map(|element| {
                let secure = element.CurrentIsPassword().is_ok_and(BOOL::as_bool);
                let hints = element
                    .CurrentName()
                    .map(|v| v.to_string())
                    .unwrap_or_default();
                Some(Field {
                    kind: kind(secure, false, false, &hints),
                    rect: Some(bounds(element.CurrentBoundingRectangle().ok()?)?),
                    ..Field::default()
                })
            })
            .take(48)
            .collect(),
    )
}
