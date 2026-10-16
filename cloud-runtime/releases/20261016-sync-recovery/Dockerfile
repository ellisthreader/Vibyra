FROM registry.fly.io/vibyra-cloud-runtime@sha256:40eca3fbd0d4d54f266490d9b9d72907fbb05e7b2defcee9669ef175c6b7239b
COPY baseline.sha256 /tmp/vibyra-resend-baseline.sha256
RUN sha256sum -c /tmp/vibyra-resend-baseline.sha256
COPY --chown=0:0 --chmod=0644 src/sync-snapshot.mjs /opt/vibyra/src/sync-snapshot.mjs
RUN node --check /opt/vibyra/src/sync-snapshot.mjs && echo "3af7a1c8ed237c4148a8ec3e5bc964c90ec9f089024ec6af68be3ed5e77e90f5  /opt/vibyra/src/sync-snapshot.mjs" | sha256sum -c - && rm /tmp/vibyra-resend-baseline.sha256
