# Phone Companion Onboarding

The replacement phone/web app lives in `mobile/`; root `src/` is the legacy
client. Use `mobile/src/onboarding/` and `mobile/src/ui/WorkspaceApp.tsx` for
first-run welcome, setup help, sample entry, explicit skip and connected success.
No Vibyra account gate is required for this standalone Host preview.

Welcome completion is local to the device and only follows Open workspace or
Set up later. Sample exploration does not complete setup or grant Host trust.
Native stores the preference in SecureStore; web persists only this non-secret
flag in localStorage. Browser pairing keys remain memory-only. Storage failure
allows entry with a persistence notice. Settings can reopen the welcome screen.
Pairing invitations are single-use and expire after two minutes. After cancelling
or an expired link, type `pair` in the Host console to create a fresh invitation.
Remembered computers offer an explicit reconnect action; remembered identity
is not evidence of a live connection. Closing a pending pairing sheet cancels it.

Desktop `SettingsPhonePane.tsx` is reachable through Settings and the command
palette, labelled WIP but usable. It opens native-allowlisted app/download/guide
resources and generates a reviewable Windows PowerShell or Linux command for
an explicit project and private IPv4 address. It does not auto-run Host, expose
an internet listener, or synchronize existing Desktop chats.

The hosted HTTPS browser requires wss. `checkBrowserConnection` rejects ws
before enrollment with actionable copy; native phone and locally served HTTP
web retain private-LAN ws support with the existing encrypted transport.
Host local-console approval remains mandatory. Paired terminal access has the
computer account's authority; project file browsing has a narrower boundary.

Run the replacement with `npm --prefix mobile run phone` (SDK 57), choosing a
free explicit port when another checkout owns 8081. Check listener ownership,
manifest and native bundle before sharing a development URL. Do not apply the
legacy SDK 54 note to `mobile/`; use the Expo diagnostics skill's surface rule.

Validation: mobile `check`, `export`, `verify:onboarding`, `verify:ui`, and
`verify:host-ui`; `node scripts/verify-desktop-setup.mjs` from mobile validates
Desktop setup navigation/controls with mocked IPC. Native allowlisted URL tests
and platform package gates are separate from the browser harness. Real Host UI
checks cover approval, terminals, file effects/review, reconnect and stopping.
Physical iPhone acceptance and store signing remain separate release gates.
