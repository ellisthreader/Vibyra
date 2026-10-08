# Build from the repository root (the Host needs host/ and desktop-tauri/src-tauri/crates/vibyra-core):
#   docker build -f cloud-runtime/Dockerfile \
#     --build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:<verified-digest> \
#     --build-arg RUST_IMAGE=rust:1.97.1-bookworm@sha256:<verified-digest> \
#     -t <registry>/<runtime>:<release> .
# Pinned tool versions are build args; bump them deliberately, then re-run the container smoke tests.
ARG RUST_IMAGE=rust:1.97.1-bookworm
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${RUST_IMAGE} AS host-build
WORKDIR /build
RUN apt-get update && apt-get install -y --no-install-recommends libdbus-1-dev pkg-config nodejs npm php-cli xvfb xauth && rm -rf /var/lib/apt/lists/*
# vibyra-core inherits `workspace = true` dependencies from desktop-tauri/src-tauri/Cargo.toml, so that manifest
# (with a stub target) must be present even though the desktop app itself is not built.
COPY desktop-tauri/src-tauri/Cargo.toml desktop-tauri/src-tauri/Cargo.toml
COPY desktop-tauri/src-tauri/crates/vibyra-core desktop-tauri/src-tauri/crates/vibyra-core
RUN mkdir -p desktop-tauri/src-tauri/src && echo 'fn main() {}' > desktop-tauri/src-tauri/src/main.rs && : > desktop-tauri/src-tauri/src/lib.rs
# The provider bridge (host/provider-bridge/*.cjs) is embedded into the binary with include_str!.
COPY desktop-tauri/src-tauri/src/phone/preview_service.rs desktop-tauri/src-tauri/src/phone/preview_service.rs
COPY desktop-tauri/src-tauri/src/phone/preview_service desktop-tauri/src-tauri/src/phone/preview_service
COPY desktop-tauri/src-tauri/src/phone/preview_grants.rs desktop-tauri/src-tauri/src/phone/preview_grants.rs
COPY desktop-tauri/src-tauri/src/phone/preview_grants desktop-tauri/src-tauri/src/phone/preview_grants
COPY desktop-tauri/src-tauri/src/phone/backend/preview_control.rs desktop-tauri/src-tauri/src/phone/backend/preview_control.rs
COPY desktop-tauri/src-tauri/src/window_preview desktop-tauri/src-tauri/src/window_preview
COPY desktop-tauri/src-tauri/src/preview_probe.rs desktop-tauri/src-tauri/src/preview_probe.rs
COPY desktop-tauri/src-tauri/src/process_table.rs desktop-tauri/src-tauri/src/process_table.rs
COPY desktop-tauri/src-tauri/src/session_process_files.rs desktop-tauri/src-tauri/src/session_process_files.rs
COPY desktop-tauri/src-tauri/src/phone/preview_service_fixture_support.rs desktop-tauri/src-tauri/src/phone/preview_service_fixture_support.rs
COPY desktop-tauri/src-tauri/src/phone/preview_service_fixture_tests.rs desktop-tauri/src-tauri/src/phone/preview_service_fixture_tests.rs
COPY host host
RUN cd host && xvfb-run -a cargo test --locked -p vibyra-host --bin vibyra-host -- preview_service --test-threads=2 && cargo build --release --locked -p vibyra-host && install -m 755 target/release/vibyra-host /vibyra-host && cp -a "$(rustc --print sysroot)" /rust-sdk && rm -rf /rust-sdk/share/doc

# Exercise the production Linux capture/input backend, not just protocol mocks.
RUN cd host && VIBYRA_WINDOW_CAPTURE_TESTS=1 xvfb-run -a cargo test --locked -p vibyra-host --bin vibyra-host -- window_preview --test-threads=1

FROM ${NODE_IMAGE}
ARG CLAUDE_CODE_VERSION=2.1.286
ARG CODEX_VERSION=0.159.3
RUN apt-get update && apt-get install -y --no-install-recommends git gh ca-certificates openssl curl procps nftables util-linux python3 python3-tk python3-venv php-cli php-mbstring php-xml composer make g++ cmake ninja-build pkg-config patchelf libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev libssl-dev libdbus-1-dev qt6-base-dev python3-gi gir1.2-gtk-3.0 xvfb xauth openbox dbus-x11 libdbus-1-3 libatk-bridge2.0-0 libatspi2.0-0 libgtk-3-0 libwebkit2gtk-4.1-0 libgl1-mesa-dri libegl1 libgbm1 libnss3 libasound2 libxtst6 fonts-dejavu-core iproute2 \
    && rm -rf /var/lib/apt/lists/* && groupadd -g 1001 project && useradd -u 1001 -g 1001 -m project \
    && mkdir -p /tmp/project /data /run/vibyra && chown 1001:1001 /tmp/project \
    && npm install -g --omit=dev "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" "@openai/codex@${CODEX_VERSION}" && npm cache clean --force
COPY --from=host-build /vibyra-host /usr/local/bin/vibyra-host
COPY --from=host-build /rust-sdk /opt/rust
RUN ln -s /opt/rust/bin/cargo /usr/local/bin/cargo && ln -s /opt/rust/bin/rustc /usr/local/bin/rustc && ln -s /opt/rust/bin/rustdoc /usr/local/bin/rustdoc
WORKDIR /opt/vibyra
COPY cloud-runtime/package.json ./package.json
COPY cloud-runtime/src ./src
COPY cloud-runtime/bin ./bin
COPY cloud-runtime/hooks ./hooks
COPY cloud-runtime/entrypoint.sh ./entrypoint.sh
# Root-owned, not writable by the project user: credential helper, push guard, system gitconfig.
COPY cloud-runtime/gitconfig /etc/gitconfig
RUN chmod 755 entrypoint.sh bin/* hooks/* && chmod 644 /etc/gitconfig && chmod -R go-w /opt/vibyra /etc/gitconfig
ENTRYPOINT ["/opt/vibyra/entrypoint.sh"]
