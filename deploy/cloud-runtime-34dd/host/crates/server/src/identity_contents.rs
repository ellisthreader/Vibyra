use std::{fs, io::Write, path::PathBuf};

/// One identity file, serialized and ready to be written.
pub struct Contents {
    pub(crate) path: PathBuf,
    pub(crate) bytes: Vec<u8>,
}
impl Contents {
    pub fn write(&self) -> Result<(), String> {
        let directory = self.path.parent().ok_or("Invalid identity path")?;
        let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
        super::identity_permissions::new_file(file.path())?;
        file.write_all(&self.bytes).map_err(|e| e.to_string())?;
        file.as_file().sync_all().map_err(|e| e.to_string())?;
        file.persist(&self.path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        fs::File::open(directory)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
