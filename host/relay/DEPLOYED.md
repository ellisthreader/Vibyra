# Deployed relay source

The Railway service `vibyra-relay` (deployment f6d3fa75, 2026-10-08) was uploaded from the CLI, so it has no Git SHA. The files in
`src/`, `package.json` and `package-lock.json` here are byte-identical to what runs there (verified over read-only SSH on 2026-10-16).
Redeploy from this folder; the older relay in earlier commits has no phone authorization, admission, revocation or lease checks.
The deployment uses `Dockerfile` (healthcheck `/health`); `railway.json` here names a different builder and was never what ran.
