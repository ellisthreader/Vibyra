# Main account integrations: reviewed implementation

2026-09-07. This narrows the earlier catalogue plan to Ellis's latest request.
Source: `feature/agent-integrations`, based on teammate reliability `cfd2f94`.
The installed application and production server have not been changed.

1. Keep the repaired modal portal/focus boundary; add an Integrations button to
   the teammate header. Use a searchable, scrollable modal with compact rows.
2. Implement Gmail, Google Calendar, Google Drive, Outlook, Microsoft Calendar,
   OneDrive, Stripe, Shopify and GitHub. Exclude ProtonMail and lifestyle services.
3. Reuse Vibyra's authenticated backend for confidential OAuth. Provider tokens
   are encrypted in the backend database; native Rust owns the Vibyra token and
   system-browser launch. The renderer never receives either token family.
4. Verify identity and a useful API read before recording Connected. Support
   multiple accounts, explicit teammate read grants, check, reconnect and disconnect.
5. Route bounded read tools through the existing Claude MCP and Codex dynamic-tool
   gates. Recheck active turn/account natively and account/device/agent grant server-side.
6. Validate callback state, PKCE where supported, scope denial, expiry, cancellation,
   replay, revoked sessions, refresh rotation and provider outages. Inspect Chromium
   and native WebKit interactions, both themes and a narrow viewport.
7. Register provider applications and callbacks, run real account journeys, then
   package/release the exact source. Configuration and live tests remain separate gates.

Initial useful reads deliberately match the row descriptions: mail subjects and
previews; upcoming events; file names/links; recent Stripe payments; Shopify product
and order summaries; public GitHub repositories. Reads are bounded first pages.
They do not promise full mailbox export, document content ingestion, complete payment
reconciliation, private GitHub repository automation, writes or background workflows.

The broad prior plan's external writes, approval journal, webhooks for business
workflows, form inbox, media processing and always-on workers remain later phases.
Only Shopify uninstall/privacy webhook handling is included in this phase.

Provider setup instructions: `docs/runbooks/agent-integrations.md`.
Validation and outstanding gates: `docs/audits/agent-integrations-2026-09-07.md`.
