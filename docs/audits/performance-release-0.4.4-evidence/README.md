# Measurement provenance

Release receipts describe the signed 0.4.4 packages and Railway deployment.
The later `cloud-benchmark.json` and `*-terminal-benchmark.json` files are isolated
fixture measurements from 5 September 2026, not production traffic.

## Cloud workload

`benchmark-cloud.mjs` loads the actual TypeScript cloud transport from the release
checkout, uses its negotiation and delta construction, and sends authenticated
HTTP requests to the real Laravel application in the built Nixpacks image.
SQLite, a public synthetic fixture account/token, loopback-only port mapping,
array mail transport and blocked outbound Laravel HTTP keep the fixture isolated.
The benchmark checks full state equality after every measured save. The backend
normalizes a missing `projectMemories` field to an empty array; this expected
field is included in the fixture state.

The image contains source `7a00633`; cloud handlers are unchanged in deployed
`cc8f57f`. It uses the earlier auto Nginx worker setting, before the final two-worker
production adjustment. No production latency or final-worker-count comparison
is inferred from these data. Initial negotiation/full saves and verification reads
are outside the per-edit transfer totals.

## Packaged native workload

The signed AppImages ran on the Intel i7-6700K Linux PC, using separate XDG
profiles and private D-Bus sessions. Password login reached the actual fixture;
secure-store persistence failed and the native app retained the verified session
in memory. The project contained only the temporary terminal test fixture.

`terminal-fixture.py` executes as a real child in Vibyra's PTY. It records exact
input and prints the bounded output workload. `benchmark-terminal.py` injects
X11 keyboard/clipboard input, compares PTY readback, then samples native/WebKit
CPU and RSS for 15 seconds. The nested Xephyr display is excluded from process
CPU/RSS. Text visible through the final output marker was inspected privately.
No desktop screenshots containing unrelated user activity are published.

The main paste workload waits 500 ms for asynchronous clipboard acquisition.
`candidate-cold-paste.json` records an earlier immediate-Enter ordering failure;
the candidate's first raw event file includes that failed trial and subsequent
successful workload. Do not count its waiting rerun as a fix. The baseline's
five warm immediate-paste repetitions passed; cold-path attribution is unresolved.

The 0.4.3 baseline tried to download the newly published 0.4.4 before measurement.
It was stopped before installation and its original SHA256 was rechecked. The
completed baseline and second candidate run used process-local external proxy
failure with loopback exempted, then the app's explicit offline continuation.
The original candidate run permitted ordinary update checks. None of these runs
measures ordinary cold startup, key-to-paint latency, normal GNOME compositing,
a phone, or large-workspace/multi-pane performance.

## Reproduction limits

The saved scripts are the exact task-local harnesses used, with local checkout,
cache and display paths. Configure those paths, create the isolated Laravel
fixture and launch/sign into the signed package before rerunning. They are not
standalone CI tests. Test accounts and tokens are synthetic and never work on
production. All owned test containers, native processes and the nested X server
were stopped after measurement; the installed stable 0.4.4 checksum was rechecked.
