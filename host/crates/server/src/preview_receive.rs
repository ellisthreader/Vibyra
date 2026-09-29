use super::PreviewSession;
use vibyra_transport::preview::Frame;

impl PreviewSession {
    /// Called only with a decrypted Preview discriminator. Malformed frames
    /// close this device's transport; a disabled or overloaded Preview instead
    /// receives a bounded cancellation and leaves terminal RPC available.
    pub fn receive(&mut self, bytes: &[u8]) -> Result<(), String> {
        let frame = Frame::decode(bytes).map_err(str::to_string)?;
        let key = frame.key();
        let is_cancel = matches!(frame, Frame::Cancel { .. });
        let state = {
            match self.canceled.lock() {
                Ok(keys) if is_cancel && keys.len() >= 256 && !keys.contains(&key) => Err(()),
                Ok(mut keys) if is_cancel => {
                    keys.insert(key);
                    Ok(false)
                }
                Ok(keys) => Ok(keys.contains(&key)),
                Err(_) => Err(()),
            }
        };
        if state.is_err() {
            self.disable();
            return Ok(());
        }
        if state == Ok(true) {
            return Ok(());
        }
        let sender = if is_cancel {
            self.control.as_ref()
        } else {
            self.data.as_ref()
        };
        if let Some(sender) = sender {
            if sender.try_send(frame).is_ok() {
                return Ok(());
            }
            self.disable();
        }
        if !is_cancel {
            let _ = self.queue.push(Frame::Cancel { key });
        }
        Ok(())
    }
}
