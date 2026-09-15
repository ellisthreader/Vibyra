use std::collections::HashMap;

use crate::agents::program_in_path;

/// Which of these executables the user actually has. Tool ids are the
/// executable name, so the check is a PATH lookup and nothing more. The stack
/// step disables the rows whose tools are missing rather than letting a run
/// fail halfway through.
pub fn installed_tools(tools: &[String]) -> HashMap<String, bool> {
    tools
        .iter()
        .map(|tool| (tool.clone(), program_in_path(tool)))
        .collect()
}
