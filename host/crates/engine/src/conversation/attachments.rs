use super::authorize;
use crate::{journal::Journal, text, Engine};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

impl Engine {
    pub(crate) fn conversation_attachment(&self, device: &str, p: &Value) -> Result<Value, String> {
        let id = text(p, "sessionId")?;
        let upload = text(p, "attachmentId")?;
        crate::identifier(upload)?;
        let state = self.shared.lock();
        authorize(state.session(id)?, device, p)?;
        let name = text(p, "name")?;
        let mime = text(p, "mime")?;
        if name.is_empty()
            || name.len() > 160
            || name.chars().any(char::is_control)
            || !matches!(
                mime,
                "image/png" | "image/jpeg" | "image/webp" | "text/plain"
            )
        {
            return Err("Choose a PNG, JPEG, WebP or plain text attachment".into());
        }
        let old: Option<(String,String,String,String,String)> = state.journal.connection.query_row(
            "SELECT device,name,mime,content,hash FROM conversation_uploads WHERE session=?1 AND id=?2",
            params![id,upload],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional().map_err(|e|e.to_string())?;
        let offset = p["offset"].as_u64().ok_or("Missing attachment offset")? as usize;
        let chunk = text(p, "content")?;
        if chunk.len() > 16 * 1024 || !chunk.is_ascii() {
            return Err("Invalid attachment chunk".into());
        }
        if let Some((_, _, _, content, hash)) = &old {
            if !hash.is_empty()
                && (offset + chunk.len() != content.len()
                    || content.get(offset..) != Some(chunk)
                    || p["complete"] != true)
            {
                return Err("A prepared attachment is immutable; create another upload".into());
            }
        }
        let mut content = match old {
            Some((owner, old_name, old_mime, content, _))
                if owner == device && old_name == name && old_mime == mime =>
            {
                content
            }
            Some(_) => return Err("Attachment belongs to another upload".into()),
            None => String::new(),
        };
        // Exact chunk retries are idempotent. Other overlapping writes are refused.
        if offset < content.len() {
            if content.get(offset..offset + chunk.len()) != Some(chunk) {
                return Err("Attachment upload changed".into());
            }
        } else if offset == content.len() {
            content.push_str(chunk);
        } else {
            return Err("Attachment upload has a gap".into());
        }
        let limit = if mime == "text/plain" {
            180_000
        } else {
            2_800_000
        };
        if content.len() > limit {
            return Err("Use an image under 2 MB or text under 128 KB".into());
        }
        let bytes: i64 = state.journal.connection.query_row("SELECT COALESCE(SUM(length(content)),0) FROM conversation_uploads WHERE session=?1 AND id<>?2",
            params![id,upload],|r|r.get(0)).map_err(|e|e.to_string())?;
        if bytes + content.len() as i64 > 16 * 1024 * 1024 {
            return Err("This conversation has reached its attachment limit".into());
        }
        let complete = p["complete"] == true;
        let mut hash = String::new();
        if complete {
            let decoded = STANDARD
                .decode(&content)
                .map_err(|_| "Invalid attachment encoding")?;
            let valid = match mime {
                "image/png" => decoded.starts_with(b"\x89PNG\r\n\x1a\n"),
                "image/jpeg" => decoded.starts_with(&[255, 216, 255]),
                "image/webp" => decoded.starts_with(b"RIFF") && decoded.get(8..12) == Some(b"WEBP"),
                _ => std::str::from_utf8(&decoded).is_ok(),
            };
            if !valid {
                return Err("Attachment content does not match its type".into());
            }
            hash = format!("{:x}", Sha256::digest(&decoded));
        }
        state.journal.connection.execute("INSERT INTO conversation_uploads(session,id,device,name,mime,content,hash) VALUES(?1,?2,?3,?4,?5,?6,?7)
            ON CONFLICT(session,id) DO UPDATE SET content=excluded.content,hash=excluded.hash",
            params![id,upload,device,name,mime,content,hash]).map_err(|e|e.to_string())?;
        Ok(
            json!({"id":upload,"name":name,"mime":mime,"hash":hash,"complete":complete,"offset":content.len()}),
        )
    }
}
impl Journal {
    pub(super) fn attachment_inputs(
        &self,
        session: &str,
        device: &str,
        ids: &Value,
    ) -> Result<(Vec<Value>, Vec<Value>), String> {
        if ids.is_null() {
            return Ok((vec![], vec![]));
        }
        let ids = ids
            .as_array()
            .filter(|ids| ids.len() <= 4)
            .ok_or("Attach up to four files")?;
        let mut inputs = Vec::new();
        let mut manifest = Vec::new();
        for id in ids {
            let id = id.as_str().ok_or("Invalid attachment ID")?;
            let (name,mime,content,hash): (String,String,String,String) = self.connection.query_row(
                "SELECT name,mime,content,hash FROM conversation_uploads WHERE session=?1 AND id=?2 AND device=?3 AND hash<>''",
                params![session,id,device],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).map_err(|_|"Finish preparing attachments before sending")?;
            inputs.push(if mime=="text/plain" {
                let decoded = STANDARD.decode(&content).map_err(|e|e.to_string())?;
                json!({"type":"text","text":format!("Attached file: {name}\n{}",String::from_utf8(decoded).map_err(|e|e.to_string())?),"text_elements":[]})
            } else { json!({"type":"image","url":format!("data:{mime};base64,{content}")}) });
            manifest.push(json!({"id":id,"name":name,"mime":mime,"hash":hash}));
        }
        Ok((inputs, manifest))
    }
}
