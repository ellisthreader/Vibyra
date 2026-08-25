# Dictation Level Meter

Scope: how the F8 HUD gets a real microphone level, and why it is drawn the way
it is. Shipped 2026-08-25.

## What Was Wrong

The three bars in the HUD were a CSS keyframe (`voice-level`, 680 ms, infinite
alternate). They bounced identically whether the user was shouting or the
microphone was unplugged — no audio ever reached the renderer. `voice_start`
spawns `arecord`, which writes raw S16LE 16 kHz mono to a temp file, and Rust
did not look at the file again until F8 was released.

## The Route Chosen

**Rust tails the capture it is already writing** (`commands/voice_level.rs`).
A plain thread wakes every 50 ms, reads only the bytes appended since the last
tick, and emits `voice:level` with a 0..1 number.

Rejected: opening a second microphone in the webview with `getUserMedia` +
`AnalyserNode`. It needs no Rust and gives a free FFT, but it means two clients
on one device while `arecord` holds it — which PipeWire allows and plain ALSA
is not obliged to — plus a WebKitGTK permission prompt. Do not switch to it
without a reason; the file is already there.

## Four Rules That Are Load-Bearing

**The dBFS mapping is why the meter looks alive.** `level_from_rms` maps
-55 dBFS (a quiet room) to 0 and -10 dBFS (speaking into a desk mic) to 1.
Reading raw amplitude instead leaves ordinary speech at about 9% of the meter,
which reads as broken rather than as quiet. `voice_level_tests.rs` pins quiet /
speaking / loud into the low, middle and top thirds — that test is the guard.

**A tick never measures more than 0.1 s.** If the meter falls behind — a
stalled UI, a slept machine, or a free-wheeling device — `read_tail` skips the
offset forward to the end rather than replaying the backlog. Verified the hard
way: `arecord -D null` is unclocked and wrote 1.4 GB in 1.5 seconds.

**The renderer holds no state and runs no frame loop.** `VoicePulse` writes two
transforms straight to the DOM in the event handler; the 70 ms CSS transition
lets the compositor draw the frames between the 20 Hz events. React never
re-renders while dictating. Do not "improve" this with `useState` or rAF.

**Silence is visible, absence is animated.** The resting shape is a real size at
14% opacity, because a meter that collapses to nothing looks like a dead
microphone. Separately, if no level arrives within `VOICE_LEVEL_STALE_MS` the
pulse adds `voice-pulse--idle` and breathes — the fallback for an older build
or an unreadable capture.

## Source Ownership

- `src-tauri/src/commands/voice_level.rs` — the meter thread, `read_tail`,
  `rms_of`, `level_from_rms`. Split from `voice.rs`, which was over the 200-line
  limit with it inline.
- `src-tauri/src/commands/voice.rs` — owns `BYTES_PER_SECOND` and
  `MAX_RECORDING_SECONDS`, which the meter derives its caps from, and clears
  `metering` on both teardown paths (`voice_stop` and `stop_recorder`).
- `src/lib/voiceLevel.ts` — attack/release smoothing and the pulse geometry.
- `src/components/layout/VoicePulse.tsx`, `src/styles/workspace-voice-hud.css`
- Tests: `voice_level_tests.rs` (8), `tests/voiceLevel.test.mjs` (6).

## Checks

`npm --prefix desktop-tauri run verify`. The meter's behaviour against a real
microphone cannot be unit-tested; the tests cover the maths and the file
tailing, and the incremental-write assumption was checked against `arecord`.
