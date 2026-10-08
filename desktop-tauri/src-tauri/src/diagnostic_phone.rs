//! Native acceptance probes share the compiled production backend. Keeping this
//! narrow facade prevents path-included copies from drifting as modules evolve.
pub use crate::phone::backend::DesktopBackend;
pub use crate::phone::shared_backend::SharedBackend;
pub use crate::phone::vault::Vault;
pub use crate::phone::workspace::{DesktopPane, DesktopProject, SharedWorkspace};
