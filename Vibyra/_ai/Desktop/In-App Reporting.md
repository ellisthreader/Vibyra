# Desktop - In-App Reporting

Read this for the cross-domain Vibyra Desktop report flow and its production
delivery contract.

## Ownership And Route

`src/components/report/ReportModal.tsx` renders the dialog and
`src/state/reportStore.ts` owns the draft. `src-tauri/src/commands/report.rs`
collects the optional terminal tail and vetted local images, then
`src-tauri/src/report_upload.rs` sends multipart data with the native-only
account bearer token to authenticated `POST /api/reports`.

Laravel owns delivery through `DesktopReportEndpoint`,
`DiscordReportDelivery`, and `DiscordReportFormatter`. The endpoint validates
and bounds the structured report plus attachments, overrides client-supplied
reporter identity with the authenticated account, blocks Discord mentions,
and is limited to five submissions per ten minutes. It returns a reference
such as `VR-8F3K2Q` only after Discord accepts the message.

## Secret And Deployment Boundary

`VIBYRA_REPORT_WEBHOOK_URL` is a backend deployment secret read through
`config/services.php`; it must never be embedded in Desktop, stored in a user
keyring, put in Settings, committed, or written to memory. Every installed app
therefore uses the same ready backend path with no setup command. The separate
machine-local `VIBYRA_DISCORD_WEBHOOK_URL` remains only for maintainer model
release alerts.

Production PHP starts with `upload_max_filesize=8M` and `post_max_size=48M` so
the client contract of one screenshot plus four vetted images survives the web
runtime. Invalid or absent webhook configuration fails closed with safe user
copy; provider details and the secret never reach the app.

## Dialog Simplicity Contract

The default report path is two required fields: a short title and what happened.
`reportDraft` still defaults to bug, normal impact, and the detected app area;
type, impact, area, reproduction steps, expected behaviour, and contact stay
under **More details**. Screenshot and image actions remain compact.

Technical context stays collapsed, but its summary must visibly say when recent
terminal output is included. Keep its terminal-output checkbox and full context
list available so simplification never makes the payload surprising.
`useModalFocus` honours `data-autofocus`, and the short-title input is the report
dialog's first focus target.

Treat this as renderer-only presentation: preserve `ReportDraft`,
`reportStore.submit`, `src/ipc/report.ts`, and every native/backend delivery
contract when simplifying the dialog. Render both desktop and narrow states in
addition to the focused report test, typecheck/build, and 200-line gate.

## Permission And Validation Rules

The dialog lists every automatic context value, including the full project
folder, before submission. Terminal output stays separately switchable and is
limited to the last 120 ANSI-stripped lines. Image paths stay local: Rust reads
and magic-number-checks the bytes, while the backend receives only multipart
files and assigns safe names.

Validate changes with `DesktopReportApiTest`, the full backend suite, Desktop
typecheck/tests/build/dead-code/line gate, and Cargo fmt/test/clippy. Do not
restore `report:configure`, `report_channel_ready`, or a client webhook.
