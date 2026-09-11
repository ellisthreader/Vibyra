# Vibyra Remote protocol 1: terminal prototype

New Codex iOS chats can opt into the additive [structured conversation extension](conversations.md). Existing sessions remain PTYs.

This is the current local trusted-device implementation, not the complete iOS
master-plan protocol. Pairing binds a device key through a one-use invitation
and explicit approval in the Host console. All configured project roots are
available to that trusted device. A controlled shell runs with the computer
user's privileges; its working directory is not a filesystem or OS sandbox.

Account-bound enrollment, per-project device grants, cloud revocation leases,
production relay qualification are not implemented. Do not expose this as the
completed M2 service or promise the later M3 task workflow.

The Mac 0.1.9 embedded adapter serves existing desktop PTYs with a read-only
Backend: session create/control/stop, filesystem and preview methods reject.
It advertises `capabilities.readOnly` and `Session.readOnly`; trusted phones
can observe all desktop terminal output. See the Desktop iPhone Connection
memory note for enable, approval, revoke and private-network requirements.

Standalone execution happens on Vibyra Host. Clients never receive provider credentials.
Optional `--discover` advertises `_vibyra-host._tcp.local.` with the Host name,
protocol version and TXT `id` (the Host static public key, which is also the
`hostId`) on a LAN listener; loopback discovery is rejected. That key lets a
phone authenticate the Host during the Noise handshake and authorizes nothing
by itself. The advertisement still carries no invitations, device keys,
credentials or project data, and discovered names remain untrusted.

Where the Host advertises itself, a phone that found it may send `Hello`
without `invite` ("nearby pairing"): the request enters the same bounded local
approval queue, logs `Nearby pairing request from ...`, and is trusted only
after an explicit local `approve KEY` (or Approve in Vibyra Desktop). With
discovery off, a valid short-lived invitation remains mandatory, and a supplied
invitation is always verified even for a discovered phone. Relay and
internet-reachable connections keep using the pairing code.
See `docs/mobile-computer-connection.md` at the repository root.

Wire envelopes are JSON inside Noise_IK_25519_ChaChaPoly_BLAKE2s transport
messages (maintained snow implementation on native host and bundled WASM client).
Maximum plaintext frame is 60 KiB. WebSocket binary messages retain Noise order;
reconnect creates a fresh Noise handshake with fresh ephemeral keys.

Request: `{id: string, method: string, params: object}`.
Reply: `{id: string, ok: true, result: any}` or
`{id: string, ok: false, error: {code: string, message: string}}`.
Events: `{event: string, seq: number, data: object}`.
IDs are UUIDs; paths are host-owned project IDs, never arbitrary remote roots.

Methods and results:
- `host.state {}` -> `{protocol:1,host:{id,name,platform},projects:Project[],sessions:Session[],sessionCount:number,nextCursor:string|null,approvals:[],devices:Device[]}`. Session metadata is one bounded page; running sessions are prioritized.
- `session.list {cursor?:string,limit?:number}` -> `{sessions:Session[],sessionCount:number,nextCursor:string|null}`. Continue from the host-issued cursor for older sessions.
- `session.create {projectId,title,kind:'shell'|'codex'|'claude',requestId}` -> Session. Starts an interactive CLI in a locally configured project directory, with durable create deduplication. This is not a sandboxed project grant or a structured agent job.
- `session.snapshot {sessionId}` -> `{sessionId,output,offset,truncated,status,generation}`; live event subscriptions exist before taking the snapshot and clients discard output ending at/before snapshot offset. Output is a bounded in-memory tail, not a persistent transcript.
- `session.claim {sessionId}` -> `{lease:string,generation:string}`; one device controls input and dimensions. Claim is rejected while another active controller holds a lease.
- `session.input {sessionId,lease,generation,inputId,data}` -> `{accepted:true,inputId}`. Never automatically retry uncertain terminal input; host deduplicates within a generation.
- `session.resize {sessionId,lease,generation,cols,rows}` -> `{ok:true}`.
- `session.release {sessionId,lease}` -> `{ok:true}`.
- `session.stop {sessionId}` -> `{ok:true}`.
- `project.files {projectId,path?:string}` -> `{entries:{path,name,kind:'file'|'directory',size:number}[]}`.
- `project.read {projectId,path}` -> `{path,content,truncated:boolean}`; UTF-8 text only, bounded, symlinks contained under project.
- `project.diff {projectId}` -> `{diff:string,truncated:boolean}`; bounded git diff for review.
- `project.status {projectId}` -> `{branch:string,changes:string}`.
- `approval.list {}` -> `[]`. Legacy PTY sessions keep provider prompts in their real CLI terminal. Structured sessions use the additive conversation extension.
- `approval.resolve {...}` -> rejected. Reserved for a future exact-action approval contract; clients must not present a functioning approval inbox for this implementation.
- `device.revoke {deviceId}` -> `{ok:true}`; a paired phone can revoke itself, local host admin revokes any device.
- `preview.fetch {projectId,port,path}` -> `{status:number,headers:Record<string,string>,body:string,encoding:'base64'}`; explicit locally approved loopback project ports only, no arbitrary URLs/redirects.

Project: `{id,name,path}`. Session: `{id,projectId,title,kind,status:'running'|'exited'|'interrupted',createdAt:string}`.
Device: `{id,name,createdAt}`. Session IDs use UUIDs and never become filesystem paths.
`terminal.output` data: `{sessionId,output,offset,generation}` where offset is the cumulative UTF-8 byte end offset.
`terminal.exit` data: `{sessionId,exitCode:number|null}`. `host.changed` data: `{}`.
`terminal.resync` data: `{sessionId,generation}`. Discard the previous stream,
take a new snapshot, and obtain a fresh control lease before input or resize.
`host.warning` data: `{message}` reports persistence trouble. Event `seq` is
process-local; reconnect resynchronizes snapshots instead of replaying a durable
event log. Host restart marks formerly running sessions `interrupted` and does
not recreate processes, terminal history, or a successful outcome.

Engine API for server integration:
`Engine::new(state_dir: PathBuf, projects: Vec<(String,PathBuf)>) -> Result<Engine,String>`;
`Engine::handle(&self, device_id: &str, method: &str, params: serde_json::Value) -> Result<serde_json::Value,String>`;
`Engine::subscribe(&self) -> std::sync::mpsc::Receiver<serde_json::Value>`;
`Engine::disconnected(&self, device_id: &str)` releases control leases, never kills PTYs.
Transport owns authentication, trusted-device persistence, host identity, and overrides
host.state host/devices. Engine owns terminal execution, session metadata,
snapshot ordering, filesystem review, and process cleanup only on host shutdown.
