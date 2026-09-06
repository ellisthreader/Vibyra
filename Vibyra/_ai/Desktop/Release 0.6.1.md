# Release 0.6.1

Phone companion onboarding and Desktop Settings → Phone companion (WIP) ship
from `6485f8c920acaf81964fbb3e81f9a7e6421cb72c`; signed desktop CI run
`34059496980` passed Windows NSIS, Linux AppImage, Debian and aggregate gates.
See `docs/releases/0.6.1-onboarding-publication.md` for delivery evidence.

The new phone/web source is `mobile/`. Welcome, skip/sample semantics, local
persistence, approval/cancellation and setup ownership are documented in
[[App/Phone Companion Onboarding]]. The web preview is at https://vibyra.expo.app.
The local 0.6.1 AppImage is installed at the stable launcher path; active user
windows were preserved and require their normal restart to display new code.

Backend redeploy `44cdd3b0-85ba-470c-9905-4651e9f17214` keeps the existing
verified backend code and changes the three signed release metadata sets.
Standalone Host remains the separately signed 0.6.0 preview. Existing Desktop
chat sync, automatic Host install, public relay enrollment and physical iPhone/
store qualification remain WIP; do not infer them from successful web delivery.

The Obsidian skill's publication guidance now records that Railway key
registration must be verified by fingerprint: this CLI discovers candidates
under ~/.ssh even when a different explicit path is supplied. Temporary access
must be removed after publication; never put credentials in release evidence.
