use crate::MAX_PLAINTEXT;

/// Keeping chunks well below the Noise limit leaves scheduler turns for control
/// and terminal frames when the eventual channel multiplexer is added.
pub const MAX_CHUNK: usize = 16 * 1024;
const HEADER: usize = 20;
const MAGIC: &[u8; 2] = b"VP";
const VERSION: u8 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct StreamKey {
    id: u64,
    generation: u64,
}
impl StreamKey {
    pub fn new(id: u64, generation: u64) -> Result<Self, &'static str> {
        if id == 0 || generation == 0 {
            return Err("Preview stream and generation must be nonzero");
        }
        Ok(Self { id, generation })
    }
    pub fn id(self) -> u64 {
        self.id
    }
    pub fn generation(self) -> u64 {
        self.generation
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Priority {
    Urgent,
    Ordered,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Frame {
    Open {
        key: StreamKey,
    },
    Credit {
        key: StreamKey,
        total: u64,
    },
    Data {
        key: StreamKey,
        sequence: u32,
        bytes: Vec<u8>,
    },
    End {
        key: StreamKey,
        sequence: u32,
    },
    Cancel {
        key: StreamKey,
    },
}

impl Frame {
    pub fn key(&self) -> StreamKey {
        match self {
            Self::Open { key }
            | Self::Credit { key, .. }
            | Self::Data { key, .. }
            | Self::End { key, .. }
            | Self::Cancel { key } => *key,
        }
    }
    /// Open, Data and End retain their stream order. Credit and Cancel can pass
    /// bulk frames, but the integration must still prioritize terminal traffic.
    pub fn priority(&self) -> Priority {
        match self {
            Self::Credit { .. } | Self::Cancel { .. } => Priority::Urgent,
            _ => Priority::Ordered,
        }
    }
    pub fn encoded_len(&self) -> usize {
        HEADER
            + match self {
                Self::Open { .. } | Self::Cancel { .. } => 0,
                Self::Credit { .. } => 8,
                Self::Data { bytes, .. } => 4 + bytes.len(),
                Self::End { .. } => 4,
            }
    }
    pub fn encode(&self) -> Result<Vec<u8>, &'static str> {
        let kind = match self {
            Self::Open { .. } => 1,
            Self::Credit { .. } => 2,
            Self::Data { bytes, .. } if !bytes.is_empty() && bytes.len() <= MAX_CHUNK => 3,
            Self::Data { .. } => return Err("Invalid Preview chunk size"),
            Self::End { .. } => 4,
            Self::Cancel { .. } => 5,
        };
        if self.encoded_len() > MAX_PLAINTEXT {
            return Err("Preview frame exceeds Noise limit");
        }
        let mut out = Vec::with_capacity(self.encoded_len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&[VERSION, kind]);
        out.extend_from_slice(&self.key().id.to_be_bytes());
        out.extend_from_slice(&self.key().generation.to_be_bytes());
        match self {
            Self::Credit { total, .. } => out.extend_from_slice(&total.to_be_bytes()),
            Self::Data {
                sequence, bytes, ..
            } => {
                out.extend_from_slice(&sequence.to_be_bytes());
                out.extend_from_slice(bytes);
            }
            Self::End { sequence, .. } => out.extend_from_slice(&sequence.to_be_bytes()),
            _ => {}
        }
        Ok(out)
    }
    pub fn decode(raw: &[u8]) -> Result<Self, &'static str> {
        if raw.len() < HEADER
            || raw.len() > MAX_PLAINTEXT
            || &raw[..2] != MAGIC
            || raw[2] != VERSION
        {
            return Err("Invalid Preview frame header");
        }
        let key = StreamKey::new(
            u64::from_be_bytes(raw[4..12].try_into().unwrap()),
            u64::from_be_bytes(raw[12..20].try_into().unwrap()),
        )?;
        match (raw[3], &raw[HEADER..]) {
            (1, []) => Ok(Self::Open { key }),
            (2, rest) if rest.len() == 8 => Ok(Self::Credit {
                key,
                total: u64::from_be_bytes(rest.try_into().unwrap()),
            }),
            (3, rest) if (5..=MAX_CHUNK + 4).contains(&rest.len()) => Ok(Self::Data {
                key,
                sequence: u32::from_be_bytes(rest[..4].try_into().unwrap()),
                bytes: rest[4..].to_vec(),
            }),
            (4, rest) if rest.len() == 4 => Ok(Self::End {
                key,
                sequence: u32::from_be_bytes(rest.try_into().unwrap()),
            }),
            (5, []) => Ok(Self::Cancel { key }),
            _ => Err("Invalid Preview frame body"),
        }
    }
}
