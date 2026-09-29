//! Keyboard focus travels to the phone viewer with each frame, as one
//! base64 JSON header. The phone's loopback proxy refuses header values over
//! 4 KiB, which would fail the frame itself, so the text-field map is trimmed
//! until the header fits well inside that.

use base64::Engine;
use serde_json::Value;

pub(crate) const FOCUS_HEADER: &str = "x-vibyra-focus";
const LIMIT: usize = 3_000;

pub(crate) fn focus_header(focus: &Value) -> Option<String> {
    if !focus.is_object() {
        return None;
    }
    let mut focus = focus.clone();
    if let Some(label) = focus["label"].as_str() {
        focus["label"] = Value::String(label.chars().take(60).collect());
    }
    loop {
        let encoded = base64::engine::general_purpose::STANDARD.encode(focus.to_string());
        if encoded.len() <= LIMIT {
            return Some(encoded);
        }
        match focus.get_mut("fields").and_then(Value::as_array_mut) {
            Some(fields) if !fields.is_empty() => {
                let keep = fields.len() / 2;
                fields.truncate(keep);
            }
            _ => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn decode(header: &str) -> Value {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(header)
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[test]
    fn small_state_travels_whole() {
        let state = json!({"v":1,"editable":true,"kind":"email","serial":3,
            "label":"E-mail · Ünïcode ✓","field":[0.1,0.2,0.3,0.04],"fields":[[0.1,0.2,0.3,0.04,"email"]]});
        let header = focus_header(&state).unwrap();
        assert!(header.bytes().all(|b| b.is_ascii_graphic()), "{header}");
        assert_eq!(decode(&header), state);
    }

    #[test]
    fn big_maps_are_trimmed_to_fit_the_proxy_limit() {
        let fields = (0..48)
            .map(|i| {
                json!([
                    0.123456789,
                    i as f64 / 1000.0 + 0.000123456,
                    0.234567891,
                    0.034567891,
                    "multiline"
                ])
            })
            .collect::<Vec<_>>();
        let state =
            json!({"v":1,"editable":false,"serial":9,"fields":fields,"label":"x".repeat(4000)});
        let header = focus_header(&state).unwrap();
        assert!(header.len() <= LIMIT);
        let decoded = decode(&header);
        assert_eq!(decoded["serial"], 9);
        let kept = decoded["fields"].as_array().unwrap().len();
        assert!(kept > 0 && kept < 48, "{kept}");
        assert_eq!(decoded["label"].as_str().unwrap().len(), 60);
    }

    #[test]
    fn nothing_to_send_without_a_state() {
        assert_eq!(focus_header(&Value::Null), None);
    }
}
