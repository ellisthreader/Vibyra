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

The Mac embedded adapter serves existing desktop PTYs: session create/stop and
preview methods reject, and it advertises `capabilities.readOnly` and
`Session.readOnly`; trusted phones can observe all desktop terminal output.
`project.*`/`vibes.bind`/`vibes.tool` also reject for every project **except**
one: a single folder the person explicitly chose in Settings to read out to
their phone (a vault), opened without write access regardless of what a call
asks for. That project is the only one on this connection with
`filesAvailable:true`; every other project this adapter publishes keeps
`filesAvailable:false` because it was only ever a name for grouping terminals,
never a real folder this adapter could open.
Typing is a separate Mac setting (Settings > iPhone connection > Typing from
your phone), off by default and never granted by pairing. The adapter reports
it as `capabilities.canInput` and `Session.canInput`; while it is on,
`session.claim`/`session.input`/`session.release` follow the lease rules below
(one phone per terminal, lease and generation on every input, `inputId`
deduplication), and while it is off they reject. The Mac's own keyboard holds no
lease. Clients test `canInput === true`, so an older Mac that omits it stays
view-only. The same switch reports `capabilities.canManage`: while it is on,
`session.create {projectId,kind,title,requestId}` and `session.stop {sessionId}`
are handed to the Mac's window, which starts the terminal in that project's
own grid (its Launch setup applies, and a Safe mode checkpoint still has to be
approved on the Mac) or closes the pane/shared chat on both screens, and the
reply is the Session it became. `requestId` deduplicates a retry. Clients test
`canManage === true`; a Mac that omits it, or has typing off, refuses both.
Only shared chats the Mac's grid is showing are listed as sessions; a chat
closed on the Mac is history, not a terminal. See the Desktop iPhone
Connection memory note for enable, approval, revoke and private-network
requirements.

Standalone execution happens on Vibyra Host. Clients never receive provider credentials.
Optional `--discover` advertises `_vibyra-host._tcp.local.` with the Host name,
protocol version, TXT `id` (the Host static public key, which is also the
`hostId`) and TXT `os` (the OS family as Rust names it: `macos`, `windows`,
`linux`) on a LAN listener; loopback discovery is rejected. That key lets a
phone authenticate the Host during the Noise handshake and authorizes nothing
by itself; the OS family only decides which computer the phone draws. The
advertisement still carries no invitations, device keys, credentials or
project data, and discovered names remain untrusted. `GET /identity` on the
same listener answers the same presence (`version`, `id`, `name`, `platform`)
for clients that cannot browse Bonjour, and 404 when discovery is off.

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
- `session.snapshot {sessionId}` -> `{sessionId,output,offset,truncated,status,generation,cols?,rows?}`; live event subscriptions exist before taking the snapshot and clients discard output ending at/before snapshot offset. Output is a bounded in-memory tail, not a persistent transcript. `cols`/`rows` are the grid the program is formatting for; a client that is only watching must render that grid rather than its own width, and must still work when an older host omits them.
- `session.claim {sessionId}` -> `{lease:string,generation:string}`; one device controls input and dimensions. Claim is rejected while another active controller holds a lease.
- `session.input {sessionId,lease,generation,inputId,data}` -> `{accepted:true,inputId}`. Never automatically retry uncertain terminal input; host deduplicates within a generation.
- `session.resize {sessionId,lease,generation,cols,rows}` -> `{ok:true}`.
- `session.release {sessionId,lease}` -> `{ok:true}`.
- `session.stop {sessionId}` -> `{ok:true}`.
- `project.files {projectId,path?:string}` -> `{entries:{path,name,kind:'file'|'directory',size:number}[]}`.
- `project.read {projectId,path}` -> `{path,content,truncated:boolean}`; UTF-8 text only, bounded, symlinks contained under project.
- `project.diff {projectId}` -> `{diff:string,truncated:boolean}`; bounded git diff for review.
- `project.status {projectId}` -> `{branch:string,changes:string}`.
- `project.search {projectId,query}` -> `{query,matches:{path,line,excerpt}[],truncated:boolean,coverage:string}`; a bounded, case-insensitive text search rooted in the project (files scanned, matches and total bytes are all capped; `.git`/`.env`/`node_modules`/`.DS_Store` are skipped). This is a listing aid, like `project.files`, not part of the `vibes.tool` receipt contract below, though the same operation name (`search_files`) is also offered through it.
- `vibes.bind {projectId,chatId,accountToken}` -> `{binding,projectId,chatId}`; scopes a phone-relayed AI tool call to one (device, account, chat, project), 24h TTL, for a bound Vibes chat's `list_files`/`read_file`/`write_file`/`search_files`.
- `vibes.tool {binding,chatId,accountToken,toolId,operation,decision:'allow'|'decline',expiresAt,...operation args}` -> the operation's own result, or `{declined:true}`. Every call is a durable receipt keyed by `toolId`: a retried call with the same arguments replays its recorded result rather than repeating a write; `expiresAt` is refused beyond 15 minutes ahead. `write_file` is refused outright on a project opened read-only (a Vibyra Desktop vault) regardless of what is asked for.
- `approval.list {}` -> `[]`. Legacy PTY sessions keep provider prompts in their real CLI terminal. Structured sessions use the additive conversation extension.
- `approval.resolve {...}` -> rejected. Reserved for a future exact-action approval contract; clients must not present a functioning approval inbox for this implementation.
- `device.revoke {deviceId}` -> `{ok:true}`; a paired phone can revoke itself, local host admin revokes any device.
- `preview.fetch {projectId,port,path}` -> `{status:number,headers:Record<string,string>,body:string,encoding:'base64'}`; explicit locally approved loopback project ports only, no arbitrary URLs/redirects.

Project: `{id,name,path,filesAvailable?:boolean,kind?:'vault'|'railway'}`. `kind: 'vault'` names the Mac's chosen vault folder outright, so the phone's Integrations page can show it as Obsidian without inferring it from `filesAvailable`. `filesAvailable` is additive: absent means "trust `capabilities.readOnly`", the way every project behaved before it existed. The Mac embedded adapter sends it explicitly per project - `false` for its own terminal-grouping folders (which were never real filesystem roots), `true` for a chosen vault, which is real `project.*`/`vibes.tool` access to one read-only folder despite the connection's own `capabilities.readOnly` staying `true` for sessions. Session: `{id,projectId,title,kind,status:'running'|'exited'|'interrupted',createdAt:string}`. `host.state.railway` (`{status:'ready'|'signedOut'|'missing',account:string|null}`, Mac embedded adapter only, `null` until first checked) reports whether the Mac's own `railway` CLI is present and logged in; readiness alone does not make Railway usable. A current Mac also publishes a `kind: railway` virtual project and `vibesToolsV1`. Its `list_files` and `read_file` execute only through approved `vibes.tool` calls; `README.md` describes paged projects, environment/service metadata, latest deployments and bounded logs. Fixed CLI argument lists reject arbitrary commands and non-UUID resource IDs. The CLI account is rechecked before reads. Writes, variables, direct `project.read` bypasses and search are refused. Results cap at 8 KB; log redaction is best-effort, not a guarantee. Account changes and Mac restarts invalidate old bindings; the virtual project ID remains stable so reconnecting does not consume another project entitlement.
Device: `{id,name,createdAt}`. Session IDs use UUIDs and never become filesystem paths.
`terminal.output` data: `{sessionId,output,offset,generation}` where offset is the cumulative UTF-8 byte end offset.
`terminal.exit` data: `{sessionId,exitCode:number|null}`. `host.changed` data: `{}`.
`terminal.resync` data: `{sessionId,generation}`. Discard the previous stream,
take a new snapshot, and obtain a fresh control lease before input or resize.
Re-snapshot in place: clearing the terminal first blanks a watching client
several times a second on a busy session and discards its scrollback.
`terminal.size` data: `{sessionId,generation,cols,rows}`, sent when the host's
own grid changes. Width is an input to the program, not a property of its
output, so a client that guesses re-wraps every line and clamps a full-screen
application's absolute cursor moves into the last column it can see. A viewer
declares nothing and resizes nothing: `session.resize` remains lease-gated,
because reshaping a shared PTY would reflow it under whoever else is watching.
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
