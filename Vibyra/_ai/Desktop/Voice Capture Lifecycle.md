# Voice Capture Lifecycle

Chat voice must show **Opening microphone** during native startup and **Listening**
only after `voiceStart` resolves. `talkStore` has a distinct starting phase;
`VoiceMode` must not prompt users to speak or animate listening during startup.
Native startup includes an authenticated service check before CoreAudio opens.
F8 dictation already follows this readiness contract.

Start/stop IPC is serialized in `ipc/tools.ts`. Ending a pending start queues its
discard there; the stale completion must not queue another discard after a newer
start. Every awaited transcription/playback status rechecks the conversation
generation before changing visible state. `useVoiceLifecycle` belongs to the
account workspace, keyed by welcomeKey, not the transcript/orb view: Show
transcript must keep the same conversation alive.

Native capture adoption and speech playback execute under captured-account
`with_token` authority. Auth transition/teardown stops capture and playback
without relying on renderer cleanup surviving a page reload. Lock order is
account → voice/PLAYBACK; audio callbacks and resource Drop must never re-enter
the account manager. Retain these checks when changing account lifecycle.

`tests/talkReadiness.test.mjs` drives the real store and serialized IPC adapter
with delayed startup, failure, cancellation/restart, late transcription/status,
and account-workspace teardown. Run native binding/capture/speech cleanup tests
and the full release gate for boundary changes. These tests do not prove physical
audio. Installed acceptance must start a bounded synthetic phrase only after
capture readiness, verify exact transcription/device routing, distinguish
software playback from audible physical output, and restore QA preferences.

This closure was prepared for Mac0.8.21 over the native-dispatch0.8.20 candidate;
exact installed/public acceptance is recorded separately in release receipts.
