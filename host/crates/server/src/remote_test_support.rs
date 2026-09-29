use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use ring::signature::{Ed25519KeyPair, KeyPair};
use serde_json::{json, Value};

pub(crate) fn claims(host: &str, device: &str, permissions: &[&str]) -> Value {
    let now = crate::remote_authorization::now();
    json!({"v":1,"sub":"123","generation":7,"sessionId":"0123456789abcdef0123456789abcdef","jti":"0123456789abcdef0123456789abcdef",
        "hostId":host,"deviceId":device,"permissions":permissions,"iat":now,"exp":now+90,"sessionExpiresAt":now+3600})
}
pub(crate) fn context() -> crate::remote_authorization::AuthorizationContext {
    crate::remote_authorization::AuthorizationContext {
        user_id: "123".into(),
        generation: 7,
    }
}
pub(crate) fn signed(claims: &Value) -> (String, String) {
    let pair = Ed25519KeyPair::from_seed_unchecked(&[42; 32]).unwrap();
    let body = URL_SAFE_NO_PAD.encode(claims.to_string());
    let message = format!("ra1.{body}");
    let signature = URL_SAFE_NO_PAD.encode(pair.sign(message.as_bytes()).as_ref());
    (
        STANDARD.encode(pair.public_key().as_ref()),
        format!("{message}.{signature}"),
    )
}
