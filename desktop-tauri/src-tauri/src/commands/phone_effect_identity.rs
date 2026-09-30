//! Exact queued terminal/conversation identities.
use super::PhoneEffect;
use std::path::Path;
impl PhoneEffect {
    pub fn project_directory(&self, cwd: &str) -> Result<(), String> {
        let root = self.root.as_ref().ok_or("Select a phone project")?;
        if Path::new(cwd).canonicalize().ok().as_ref() != Some(root) {
            return Err("This phone request names another project folder".into());
        }
        self.check()
    }
    pub fn terminal(
        &self,
        agent: &str,
        cwd: Option<&str>,
        saved: Option<i64>,
    ) -> Result<(), String> {
        let request = self.grant.request();
        let expected = if request["action"] == "resumeSaved" {
            let project = self.project.as_deref().ok_or("Select a phone project")?;
            self.phone
                .lock()
                .saved_terminal(saved.ok_or("Select a saved terminal")?, project)
                .ok_or("This saved terminal changed")?
                .0
        } else {
            request["kind"]
                .as_str()
                .ok_or("Missing requested terminal kind")?
                .to_owned()
        };
        if expected != agent {
            return Err("This phone request names another terminal kind".into());
        }
        let root = self.root.as_ref().ok_or("Select a phone project")?;
        let cwd = cwd.ok_or("Select a phone project folder")?;
        if Path::new(cwd).canonicalize().ok().as_ref() != Some(root) {
            return Err("This phone request names another project folder".into());
        }
        self.check()
    }
    pub fn ssh(&self, target: &str, saved: Option<i64>) -> Result<(), String> {
        let project = self.project.as_deref().ok_or("Select a phone project")?;
        let (kind, title) = self
            .phone
            .lock()
            .saved_terminal(saved.ok_or("Select a saved terminal")?, project)
            .ok_or("This saved terminal changed")?;
        if kind != "ssh" || title != target {
            return Err("This phone request names another SSH terminal".into());
        }
        self.check()
    }
    pub fn conversation(&self, id: &str) -> Result<(), String> {
        if self.grant.request()["conversationId"].as_str() != Some(id) {
            return Err("This phone request names another conversation".into());
        }
        self.check()
    }
}
