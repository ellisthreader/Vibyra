# Preserve the live Cloud filesystem/toolchain; replace only the tested Host executable.
FROM rust:1.97.1-bookworm@sha256:0e2bcaef56d041a486784e54104a81aebe0da44bd03019bd70bc0401e42e4a97 AS host-build
WORKDIR /build
COPY desktop-tauri/src-tauri/Cargo.toml desktop-tauri/src-tauri/Cargo.toml
COPY desktop-tauri/src-tauri/crates/vibyra-core desktop-tauri/src-tauri/crates/vibyra-core
COPY desktop-tauri/src-tauri/src desktop-tauri/src-tauri/src
COPY host host
COPY docs/cloud-sync-vectors.json docs/secret-guard-vectors.json docs/
RUN cd host \
    && cargo test --locked -p vibyra-host-engine --lib provider_policy \
    && cargo test --locked -p vibyra-host-engine --lib ai_accounts \
    && cargo test --locked -p vibyra-host --bin vibyra-host account_tests \
    && cargo build --release --locked -p vibyra-host \
    && install -m 755 target/release/vibyra-host /vibyra-host

FROM registry.fly.io/vibyra-cloud-runtime:login202610071700@sha256:fd4c3e53c5af7ccd9e511e22cd19c3f3b298a8c29eca779a854355dbf48fb13e
COPY --from=host-build /vibyra-host /usr/local/bin/vibyra-host
COPY cloud-runtime/src/sync-login.mjs cloud-runtime/src/sync-login-tar.mjs /opt/vibyra/src/
