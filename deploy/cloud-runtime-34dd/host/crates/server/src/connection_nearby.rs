//! A direct socket's entry point, and the approval notice only it can carry.
use super::{run_with, FrameReceiver, FrameSender};
use crate::state::{Origin, Shared};
use std::sync::Arc;

/// Sent in the clear, before the handshake reply, to a phone that said it
/// understands it (`caps=approval` on its WebSocket URL) when it is put in the
/// local approval queue. Its exact length can never be a Noise reply (at least
/// 48 bytes). It changes only what the phone shows; trust still comes from the
/// encrypted reply that follows.
pub const APPROVAL_PENDING: &[u8] = b"VIBYRA-APPROVAL-PENDING\x01";

/// `run_from` for a direct socket, told whether the phone reads APPROVAL_PENDING.
pub async fn run_nearby(
    shared: Arc<Shared>,
    input: FrameReceiver,
    output: FrameSender,
    origin: Origin,
    approval_notice: bool,
) -> Result<(), String> {
    run_with(shared, input, output, origin, None, approval_notice).await
}
