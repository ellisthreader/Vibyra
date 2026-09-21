use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("pty error: {0}")]
    Pty(String),

    #[error("session {0} not found")]
    SessionNotFound(u64),

    #[error("session {0} has already exited")]
    SessionExited(u64),

    #[error("invalid path: {0}")]
    InvalidPath(String),

    #[error("watch error: {0}")]
    Watch(String),

    #[error("settings error: {0}")]
    Settings(String),

    #[error("preview error: {0}")]
    Preview(String),

    #[error("scaffold error: {0}")]
    Scaffold(String),

    #[error("background task failed: {0}")]
    Task(String),
}

impl serde::Serialize for CoreError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type CoreResult<T> = Result<T, CoreError>;
