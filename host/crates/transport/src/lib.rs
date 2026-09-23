//! Ordered, authenticated Noise transport shared by the host and bundled phone WASM.
mod client;
pub use client::Client;
pub mod preview;

pub const PATTERN: &str = "Noise_IK_25519_ChaChaPoly_BLAKE2s";
pub const MAX_PLAINTEXT: usize = 60 * 1024;
pub const MAX_FRAME: usize = MAX_PLAINTEXT + 256;
const PROLOGUE: &[u8] = b"Vibyra Remote protocol 1";
/// The ChaChaPoly authentication tag each transport message carries.
const TAG: usize = 16;

pub fn builder() -> snow::Builder<'static> {
    snow::Builder::new(PATTERN.parse().expect("constant Noise pattern"))
        .prologue(PROLOGUE)
        .expect("constant protocol prologue")
}

/// First 32 bytes are private; final 32 bytes are the public key. Never log this value.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen::prelude::wasm_bindgen(js_name = generateKeypair))]
pub fn generate_keypair() -> Result<Vec<u8>, String> {
    let pair = builder().generate_keypair().map_err(error)?;
    Ok([pair.private, pair.public].concat())
}

pub fn responder(private: &[u8]) -> Result<snow::HandshakeState, String> {
    builder()
        .local_private_key(private)
        .map_err(error)?
        .build_responder()
        .map_err(error)
}

pub fn read_handshake(state: &mut snow::HandshakeState, frame: &[u8]) -> Result<Vec<u8>, String> {
    check_frame(frame)?;
    let mut plain = vec![0; MAX_FRAME];
    let len = state.read_message(frame, &mut plain).map_err(error)?;
    plain.truncate(len);
    Ok(plain)
}

pub fn write_handshake(state: &mut snow::HandshakeState, plain: &[u8]) -> Result<Vec<u8>, String> {
    check_plain(plain)?;
    let mut frame = vec![0; MAX_FRAME];
    let len = state.write_message(plain, &mut frame).map_err(error)?;
    frame.truncate(len);
    Ok(frame)
}

pub struct Channel(snow::TransportState);

impl Channel {
    pub fn from_handshake(state: snow::HandshakeState) -> Result<Self, String> {
        state.into_transport_mode().map(Self).map_err(error)
    }

    /// Buffers are sized to the message rather than the largest frame: most
    /// are a few hundred bytes, and each one waits in a send queue.
    pub fn encrypt(&mut self, plain: &[u8]) -> Result<Vec<u8>, String> {
        check_plain(plain)?;
        let mut frame = vec![0; plain.len() + TAG];
        let len = self.0.write_message(plain, &mut frame).map_err(error)?;
        frame.truncate(len);
        Ok(frame)
    }

    pub fn decrypt(&mut self, frame: &[u8]) -> Result<Vec<u8>, String> {
        check_frame(frame)?;
        // The plaintext is the frame less its tag, so the frame's length is
        // always enough.
        let mut plain = vec![0; frame.len()];
        let len = self.0.read_message(frame, &mut plain).map_err(error)?;
        if len > MAX_PLAINTEXT {
            return Err("Frame exceeds protocol limit".into());
        }
        plain.truncate(len);
        Ok(plain)
    }
}

fn check_plain(value: &[u8]) -> Result<(), String> {
    if value.len() > MAX_PLAINTEXT {
        Err("Payload exceeds protocol limit".into())
    } else {
        Ok(())
    }
}

fn check_frame(value: &[u8]) -> Result<(), String> {
    if value.len() > MAX_FRAME {
        Err("Frame exceeds protocol limit".into())
    } else {
        Ok(())
    }
}

fn error(value: impl std::fmt::Display) -> String {
    format!("Secure transport: {value}")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Buffers sized to each message still carry everything from an empty
    /// payload up to the protocol's largest, in both directions.
    #[test]
    fn messages_of_every_size_round_trip() {
        let host = generate_keypair().unwrap();
        let phone = generate_keypair().unwrap();
        let mut client = Client::new(&phone[..32], &host[32..]).unwrap();
        let mut handshake = responder(&host[..32]).unwrap();
        assert_eq!(
            read_handshake(&mut handshake, &client.start(b"hello").unwrap()).unwrap(),
            b"hello"
        );
        let reply = write_handshake(&mut handshake, b"welcome").unwrap();
        assert_eq!(client.finish(&reply).unwrap(), b"welcome");
        let mut channel = Channel::from_handshake(handshake).unwrap();
        for size in [0, 1, 70, 4096, MAX_PLAINTEXT] {
            let plain = vec![7; size];
            let frame = channel.encrypt(&plain).unwrap();
            assert_eq!(frame.len(), size + TAG);
            assert_eq!(client.decrypt(&frame).unwrap(), plain);
            assert_eq!(
                channel.decrypt(&client.encrypt(&plain).unwrap()).unwrap(),
                plain
            );
        }
        assert!(channel.encrypt(&vec![0; MAX_PLAINTEXT + 1]).is_err());
        assert!(channel.decrypt(&[0; TAG - 1]).is_err());
    }
}
