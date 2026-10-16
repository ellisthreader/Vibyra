FROM registry.fly.io/vibyra-cloud-runtime@sha256:c2923864f3a9f35d88e986b9e2c0f446429e66fe3729bf817db60c3f65c4b69d
COPY baseline.sha256 /tmp/vibyra-stop-baseline.sha256
RUN sha256sum -c /tmp/vibyra-stop-baseline.sha256
COPY --chown=0:0 --chmod=0644 src/computer.mjs /opt/vibyra/src/computer.mjs
COPY --chown=0:0 --chmod=0644 src/graceful-stop.mjs /opt/vibyra/src/graceful-stop.mjs
COPY --chown=0:0 --chmod=0644 src/host-process.mjs /opt/vibyra/src/host-process.mjs
COPY --chown=0:0 --chmod=0644 src/main.mjs /opt/vibyra/src/main.mjs
COPY --chown=0:0 --chmod=0644 src/sync-process.mjs /opt/vibyra/src/sync-process.mjs
RUN node --check /opt/vibyra/src/computer.mjs && node --check /opt/vibyra/src/graceful-stop.mjs && node --check /opt/vibyra/src/host-process.mjs && node --check /opt/vibyra/src/main.mjs && node --check /opt/vibyra/src/sync-process.mjs && echo "ae991525d91a7bb1e7fd3913e01df8272837edf23d33155ad6f38b6046fd9dd0  /opt/vibyra/src/computer.mjs" | sha256sum -c - && echo "103e63044196f3273bb73f4ed1e5d78aa37d755a68953b88b5240a1efa887358  /opt/vibyra/src/graceful-stop.mjs" | sha256sum -c - && echo "a4be22ef919af5b315761cbbc3bdc6723978ee34265aae3d17d7df97af2228d3  /opt/vibyra/src/host-process.mjs" | sha256sum -c - && echo "1f04ab1da7463b56bc266f077f713b08e8006e6acec90627771b250f5356afb4  /opt/vibyra/src/main.mjs" | sha256sum -c - && echo "dd801df2370ff05699bc156cc9e9eab6768f8b6d87d9cfabf00ef241c94a8d49  /opt/vibyra/src/sync-process.mjs" | sha256sum -c - && rm /tmp/vibyra-stop-baseline.sha256
