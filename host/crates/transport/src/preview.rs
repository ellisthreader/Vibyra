//! Bounded binary framing for a future, separately authorized Preview channel.
//! This module does not grant access to a URL or alter the terminal RPC wire.
mod flow;
mod frame;
mod queue;

pub use flow::{ReceiveWindow, SendWindow, WINDOW_BYTES};
pub use frame::{Frame, Priority, StreamKey, MAX_CHUNK};
pub use queue::FrameQueue;
