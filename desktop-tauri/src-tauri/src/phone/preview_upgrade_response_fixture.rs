//! Request-consumption credit and response metadata travel independently.
//! The fixture must tolerate their legal interleaving without skipping other frames.
use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant};
use vibyra_host::{PreviewFrame as Frame, StreamKey, UpgradeResponse};

pub(super) fn receive_metadata(
    receiver: &Receiver<Frame>,
    key: StreamKey,
) -> Result<UpgradeResponse, String> {
    let deadline = Instant::now() + Duration::from_secs(10);
    for _ in 0..32 {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or("Upgrade response metadata deadline expired")?;
        let frame = receiver
            .recv_timeout(remaining)
            .map_err(|error| error.to_string())?;
        match frame {
            Frame::Credit { key: value, .. } if value == key => {}
            Frame::Data {
                key: value,
                sequence: 0,
                bytes,
            } if value == key => {
                return UpgradeResponse::decode(&bytes);
            }
            other => return Err(format!("Unexpected upgrade response metadata: {other:?}")),
        }
    }
    Err("Upgrade response metadata exceeded the frame bound".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::mpsc;
    fn metadata(key: StreamKey, sequence: u32) -> Frame {
        Frame::Data {
            key,
            sequence,
            bytes: UpgradeResponse {
                v: 1,
                status: 101,
                headers: HashMap::from([
                    ("upgrade".into(), "websocket".into()),
                    ("connection".into(), "Upgrade".into()),
                    (
                        "sec-websocket-accept".into(),
                        "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=".into(),
                    ),
                ]),
            }
            .encode()
            .unwrap(),
        }
    }
    #[test]
    fn request_credit_after_open_can_precede_response_metadata() {
        let key = StreamKey::new(7, 41).unwrap();
        let (sender, receiver) = mpsc::channel();
        sender.send(Frame::Credit { key, total: 65795 }).unwrap();
        sender.send(metadata(key, 0)).unwrap();
        let response = receive_metadata(&receiver, key).unwrap();
        assert_eq!(response.status, 101);
        assert_eq!(
            response.headers["sec-websocket-accept"],
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
        );
    }
    #[test]
    fn stale_generation_credit_and_wrong_response_sequence_are_rejected() {
        let key = StreamKey::new(7, 41).unwrap();
        for invalid in [
            Frame::Credit {
                key: StreamKey::new(7, 42).unwrap(),
                total: 65795,
            },
            metadata(StreamKey::new(7, 42).unwrap(), 0),
            metadata(key, 1),
            Frame::Cancel { key },
            Frame::End { key, sequence: 0 },
            Frame::Data {
                key,
                sequence: 0,
                bytes: b"invalid metadata".to_vec(),
            },
        ] {
            let (sender, receiver) = mpsc::channel();
            sender.send(invalid).unwrap();
            sender.send(metadata(key, 0)).unwrap();
            assert!(receive_metadata(&receiver, key).is_err());
        }
    }
    #[test]
    fn credit_flood_is_bounded_without_waiting_for_the_deadline() {
        let key = StreamKey::new(7, 41).unwrap();
        let (sender, receiver) = mpsc::channel();
        for total in 0..32 {
            sender.send(Frame::Credit { key, total }).unwrap();
        }
        sender.send(metadata(key, 0)).unwrap();
        assert!(receive_metadata(&receiver, key)
            .unwrap_err()
            .contains("frame bound"));
    }
}
