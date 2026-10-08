use super::PreviewService;
use serde_json::{json, Value};

impl PreviewService {
    pub(super) fn agent_preview_status(
        &self,
        device: &str,
        project: &str,
    ) -> Result<Value, String> {
        let root = self
            .inner
            .workspace
            .read()
            .project_root(project)
            .ok_or_else(|| {
                format!(
                    "This conversation's project is not open in Vibyra on your {}",
                    crate::window_preview::host_noun()
                )
            })?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let list = self.list_handoff(device);
        let targets: Vec<_> = list["targets"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|target| target["projectId"] == project)
            .map(|target| {
                json!({"name":target["name"],"kind":target["kind"],
                "running":target["running"],"sharingRequired":target["approvalRequired"] == true})
            })
            .collect();
        let bindings: Vec<_> = self
            .inner
            .bindings
            .lock()
            .iter()
            .filter(|((owner, _), binding)| owner == device && binding.canonical_root == root)
            .map(|((_, generation), _)| *generation)
            .collect();
        let decoded = bindings.into_iter().any(|generation| {
            self.binding(device, generation)
                .is_ok_and(|binding| binding.window.is_some_and(|window| window.ready()))
        });
        let runs: Vec<_> = list["runnable"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|run| run["projectId"] == project)
            .map(|run| {
                json!({"name":run["name"],"command":run["command"],"approved":run["approvalRequired"] != true,
                "runState":run["runState"],"logTail":run["logTail"],"error":run["error"]})
            })
            .collect();
        let run_in = |states: &[&str]| {
            runs.iter()
                .any(|run| states.iter().any(|state| run["runState"] == *state))
        };
        let sandboxed = super::sandbox_probe::sandboxed_windowless(&root);
        let state = if decoded {
            "displaying"
        } else if run_in(&["building"]) {
            "run_building"
        } else if run_in(&["waiting_for_window"]) {
            "run_waiting_for_window"
        } else if targets.iter().any(|t| t["sharingRequired"] == true) {
            "sharing_required"
        } else if targets.iter().any(|t| t["running"] == true) {
            "available_to_open"
        } else if run_in(&["failed", "exited", "timed_out"]) {
            "run_failed"
        } else if !sandboxed.is_empty() {
            "app_started_in_agent_sandbox"
        } else if list["windowProblem"].is_string() {
            "permission_or_host_unavailable"
        } else {
            "waiting_for_window_or_website"
        };
        let action = match state {
            "run_building" | "run_waiting_for_window" => "The app is starting outside the sandbox. Check again shortly; its window opens on the phone that asked for it.",
            "run_failed" => "Read the run's error and log lines, fix the cause, then call vibyra_run_app again.",
            "app_started_in_agent_sandbox" => "These project processes run inside your sandbox, where a desktop app can never open a window. Stop them, then call vibyra_run_app with the command that starts the app.",
            _ => "To run a desktop app, call vibyra_run_app; never start GUI apps with shell commands. The phone user can also press Run in Live preview. Websites appear in Live preview on their own.",
        };
        Ok(
            json!({"clientSurface":if device == "desktop" {"mac"} else {"phone"},
            "projectId":project,"state":state,"firstFrameDecoded":decoded,
            "targets":targets,"runs":runs,"sandboxedProcesses":sandboxed,"windowProblem":list["windowProblem"],
            "action":action,
            "control":"Viewing does not authorize clicking or typing. Control requires a separate permission on the computer."}),
        )
    }
}
