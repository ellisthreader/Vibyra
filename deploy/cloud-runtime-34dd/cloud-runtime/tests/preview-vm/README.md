# Actual Cloud Preview VM checks

Run from the repository root for an authorized real-VM acceptance task. These
checks create paid Fly machines in the personal organization. They never use
customer sessions, volumes or backend credentials.

```bash
node cloud-runtime/tests/preview-vm/run.mjs \
  registry.fly.io/vibyra-cloud-runtime@sha256:<verified-64-character-digest> \
  /private/tmp/<unique-qa-report-directory>
```

The default checks ten cold boots (four Standard, three Desktop, three Power),
five Tk native pixel/click/type/start/stop cycles per boot, Rust compilation/run,
Qt compilation/window launch, PHP, an HTTP form/cookie/redirect and the real
nftables project-user network quota. A second machine starts the **unchanged
production entrypoint** against an isolated local HTTPS/signed-lease issuer. It
must receive two valid leases and actually become stopped after they expire.
The test supplies its own one-day TLS certificate and trusts it only through
the QA machine's NODE_EXTRA_CA_CERTS; it never disables TLS verification.

Append `lease-only` as the fourth argument to rerun just the signed-lease check.
This does not certify any cold-boot/native checks; retain the separate reports.
The `cycles`, `leaseLoss`, `mode` and `cleaned` fields distinguish those results.

Each run creates a unique private app, no public services, no volumes, a
non-restarting machine and a 900-second maximum smoke init lifetime. Machine
creation uses the Machines API with an exact digest because Fly CLI duplicated
the digest in `machine run` during initial QA. Stopped updates are explicitly
started and waited on. Failed tests still destroy only their own app and remove
temporary issuer/TLS private keys. If deletion fails, the report records
`cleaned: false` and the error names the exact app needing manual cleanup.

The Tk fixture explicitly presents its window and waits for it to map. Capture
uses actual geometry, not requested dimensions. Graphical lease loss marks the
session stopped before asynchronous child/directory cleanup finishes; the
fixture also waits for bounded cleanup and checks that the directory disappears.

The Docker host-build stage separately runs shared Preview tests and production
Linux native backend tests under Xvfb with VIBYRA_WINDOW_CAPTURE_TESTS=1. Those
check real window listing, capture and XTest click dispatch. The VM's Python
fixture checks the real OS/tools; it is not an authenticated phone-stream test.

Release gates and cost inputs are in
`docs/cloud/cloud-live-preview-implementation.md`. Never point these fixtures at
production or replace an invoice/DeviceCheck/physical-phone acceptance with them.
