# Official MCP SDK acceptance

Run `npm ci && npm test` from this directory after installing the backend's
Composer dependencies. SDK packages are pinned to 2.3.0 in the lockfile.

The test creates an empty temporary SQLite database, verifies its configuration
before migrating, starts Laravel on a random loopback port, and creates a
disposable read-only API key. It checks discovery, scope-filtered tools, a read,
and refusal of an unauthorized write with both the legacy and 2026-07-28 clients.
No production account, key, external provider, or billing service is used.

The companion `stdio.mjs` is an official modern-only SDK server. After `npm ci`,
run from `desktop-tauri/src-tauri`:

```sh
cargo test -p vibyra-core the_official_modern_only_sdk_server_works -- --ignored
```

These checks establish interoperability in an isolated environment. They do
not prove a deployed endpoint, installed native client, or approved live run.
