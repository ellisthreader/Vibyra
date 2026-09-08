# Agent Mode audit evidence

Start with [the report](REPORT.md). Source identity is in provenance.json;
release-metadata.json is the public release response fetched during the audit.

The frontend suite, typecheck and line gate ran from the recorded release worktree:

    npm --prefix desktop-tauri test
    npm --prefix desktop-tauri run typecheck
    node scripts/check-desktop-lines.mjs
    CARGO_BUILD_JOBS=2 cargo +1.88 test --manifest-path desktop-tauri/src-tauri/crates/vibyra-core/Cargo.toml --lib --locked

The Rust probe calls that worktree's actual core functions. Its classification
strings were not executed. The deletion fixture is confined to the hardcoded
audit scratch directory shown in native-probe.rs. The standalone probe used
separately resolved cached dependencies; its manifest and lockfile are retained
in harness/. The release's core suite above used its own locked dependencies.

Screenshots import current React components, bundled CSS and fonts. Their
account, tasks, credentials/capability labels and IPC are synthetic. They were
rendered using an isolated Chrome CDP instance at 1440x900 and 960x600. They
are not screenshots of authenticated Tauri execution. The fixture, capture
and interaction scripts are retained in harness/ with their original temporary
paths; adjust those paths before reusing the harness elsewhere.

ui-interaction-results.json records draft/access state crossing chats and an
IME Enter invoking a synthetic send handler. No provider request was issued.

No production source or user data was modified. Temporary audit servers were
stopped after capture.
