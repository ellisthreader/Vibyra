use crate::{builder, read_handshake, write_handshake, Channel};

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
pub struct Client {
    handshake: Option<snow::HandshakeState>,
    channel: Option<Channel>,
    started: bool,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen)]
impl Client {
    #[cfg_attr(
        target_arch = "wasm32",
        wasm_bindgen::prelude::wasm_bindgen(constructor)
    )]
    pub fn new(private_key: &[u8], host_public_key: &[u8]) -> Result<Self, String> {
        let handshake = builder()
            .local_private_key(private_key)
            .map_err(crate::error)?
            .remote_public_key(host_public_key)
            .map_err(crate::error)?
            .build_initiator()
            .map_err(crate::error)?;
        Ok(Self {
            handshake: Some(handshake),
            channel: None,
            started: false,
        })
    }

    pub fn start(&mut self, payload: &[u8]) -> Result<Vec<u8>, String> {
        if self.started {
            return Err("Handshake already started".into());
        }
        let state = self
            .handshake
            .as_mut()
            .ok_or("Handshake already finished")?;
        let frame = write_handshake(state, payload)?;
        self.started = true;
        Ok(frame)
    }

    pub fn finish(&mut self, frame: &[u8]) -> Result<Vec<u8>, String> {
        if !self.started {
            return Err("Handshake has not started".into());
        }
        let mut state = self.handshake.take().ok_or("Handshake already finished")?;
        let plain = read_handshake(&mut state, frame)?;
        self.channel = Some(Channel::from_handshake(state)?);
        Ok(plain)
    }

    pub fn encrypt(&mut self, plain: &[u8]) -> Result<Vec<u8>, String> {
        self.channel
            .as_mut()
            .ok_or("Handshake incomplete")?
            .encrypt(plain)
    }

    pub fn decrypt(&mut self, frame: &[u8]) -> Result<Vec<u8>, String> {
        self.channel
            .as_mut()
            .ok_or("Handshake incomplete")?
            .decrypt(frame)
    }
}
