# Vibyra Railway production source

This branch is the reproducible source for the Vibyra Railway service. It was
assembled on 2026-09-28 from the owner-confirmed localhost website
(`Vibyra-web/backend/resources` and active public assets) and the newer Vibyra
Laravel backend. The website checkout's older backend was not uploaded because
it lacks current phone and membership routes.

The active 64-second homepage film was re-encoded at 1080p for the Railway CLI
upload. Two legacy videos unused by the active bundle were omitted. Desktop
installer binaries stay on the Railway release volume, outside this repository.

The snapshot built with Vite, passed 27 frontend source checks and 113 focused
Laravel tests, and retained every prior production method/URI route (211 total).
After deployment, verify `/up`, `/`, `/downloads`, `/login`, `/account`,
`/benchmarks`, `/web-api/auth/providers`, `/web-api/download-catalog`, and the
published installer HEAD size and checksum headers. The current source of truth
for provider callback setup is `docs/runbooks/website-provider-sign-in.md` in
the website worktree.
