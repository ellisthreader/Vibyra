# Native review snapshot

The tar archive beside this note preserves the 27 exact Host/Desktop/uploader files
listed in the SHA-256 manifest. It is a review/recovery snapshot, not a standalone
build or release. Some files already contained unrelated modifications before this
work. Do not apply the whole archive blindly to a different branch or treat it as
an isolated diff. Maintained source remains in the main workspace. Backend and relay
candidate are independently reviewable on the remediation branch. The installed
Mac app was not replaced. A signed release must reconcile source version/history
and dependencies first.
