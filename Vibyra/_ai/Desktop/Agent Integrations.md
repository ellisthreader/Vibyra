# Agent integrations

2026-09-07 local implementation: sibling worktree `agent-integrations`, branch
`feature/agent-integrations`, based on teammate reliability `cfd2f94`.
Not installed/published; provider registrations and real account journeys remain gates.

Ellis chose an Integrations button opening a simple modal on the agent page,
not another tab. Initial services are Gmail, Google Calendar/Drive, Outlook,
Microsoft Calendar/OneDrive, Stripe Apps, Shopify and GitHub. ProtonMail and
lifestyle services are excluded. Initial actions are bounded read summaries;
cloud file contents, private GitHub automation and external writes are not included.

UI ownership: `desktop-tauri/src/components/integrations/`; AgentHeader hosts
its button. Reuse ModalPortal/useModalFocus, never a self-inert dialog subtree.
Native `src-tauri/src/integrations/` opens allowlisted system-browser OAuth URLs
and calls the authenticated server broker. Tokens and OAuth URLs never reach React.
Provider credentials use Laravel encrypted casts; app secrets stay server-side.
`backend/app/Services/Integrations/` owns catalogue, OAuth, reads, attempts and locks;
`IntegrationsController` exposes a fixed RPC operation set. Dedicated registrations
are separate from Vibyra login/billing and existing CLI integrations.

Connection is separate from access: grants key connection + installation ID +
agent ID. Both engine adapters forward integration_accounts/integration_read
through the active-turn gate; the server rechecks owner/device/agent access.
Provider locks serialize reconnect/refresh; row locks serialize read/grant/delete.
Refresh credentials commit even when the following read fails. Shopify has one
connection owner per store; signed webhook deletion checks body shop ID and time.
Daily model pruning removes expired OAuth attempts older than a day.

Setup: `docs/runbooks/agent-integrations.md`; configuration-only checker:
`php artisan integrations:check`. This checkout has no integration registrations.
A configured client or passing fixture is not a completed provider sign-in.
Validation/evidence: `docs/audits/agent-integrations-2026-09-07.md`. Chromium and
native WebKit interactions, backend contracts and both engine forwarding paths
were checked; live OAuth, deployment concurrency and Windows remain unmeasured.
