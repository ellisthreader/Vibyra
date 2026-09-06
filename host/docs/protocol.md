# Vibyra Remote protocol 1

All execution happens on Vibyra Host. Clients never receive provider credentials.
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
- `host.state {}` -> `{protocol:1,host:{id,name,platform},projects:Project[],sessions:Session[],approvals:Approval[],devices:Device[]}`.
- `session.create {projectId,title,kind:'shell'|'codex'|'claude',requestId}` -> Session. Explicitly approved/trusted remote devices may start project-scoped interactive sessions; no silent agent permission escalation.
- `session.snapshot {sessionId}` -> `{sessionId,output,offset,status,generation}`; live event subscriptions exist before taking the snapshot and clients discard output ending at/before snapshot offset.
- `session.claim {sessionId}` -> `{lease:string,generation:string}`; one device controls input and dimensions. Claim is rejected while another active controller holds a lease.
- `session.input {sessionId,lease,generation,inputId,data}` -> `{accepted:true,inputId}`. Never automatically retry uncertain terminal input; host deduplicates within a generation.
- `session.resize {sessionId,lease,generation,cols,rows}` -> `{ok:true}`.
- `session.release {sessionId,lease}` -> `{ok:true}`.
- `session.stop {sessionId}` -> `{ok:true}`.
- `project.files {projectId,path?:string}` -> `{entries:{path,name,kind:'file'|'directory',size:number}[]}`.
- `project.read {projectId,path}` -> `{path,content,truncated:boolean}`; UTF-8 text only, bounded, symlinks contained under project.
- `project.diff {projectId}` -> `{diff:string,truncated:boolean}`; bounded git diff for review.
- `project.status {projectId}` -> `{branch:string,changes:string}`.
- `approval.list {}` -> Approval[].
- `approval.resolve {approvalId,decision:'approve'|'deny'}` -> `{ok:true}`. Approval is bound to exact immutable action and requesting device; no execution from expired/replayed approval.
- `device.revoke {deviceId}` -> `{ok:true}`; a paired phone can revoke itself, local host admin revokes any device.
- `preview.fetch {projectId,port,path}` -> `{status:number,headers:Record<string,string>,body:string,encoding:'base64'}`; explicit locally approved loopback project ports only, no arbitrary URLs/redirects.

Project: `{id,name,path}`. Session: `{id,projectId,title,kind,status:'running'|'exited'|'interrupted',createdAt:string}`.
Approval: `{id,title,description,createdAt,expiresAt,deviceId}`.
Device: `{id,name,createdAt}`. Session IDs use UUIDs and never become filesystem paths.
`terminal.output` data: `{sessionId,output,offset,generation}` where offset is the cumulative UTF-8 byte end offset.
`terminal.exit` data: `{sessionId,exitCode:number|null}`. `host.changed` data: `{}`.

Engine API for server integration:
`Engine::new(state_dir: PathBuf, projects: Vec<(String,PathBuf)>) -> Result<Engine,String>`;
`Engine::handle(&self, device_id: &str, method: &str, params: serde_json::Value) -> Result<serde_json::Value,String>`;
`Engine::subscribe(&self) -> std::sync::mpsc::Receiver<serde_json::Value>`;
`Engine::disconnected(&self, device_id: &str)` releases control leases, never kills PTYs.
Transport owns authentication, trusted-device persistence, host identity, and overrides
host.state host/devices. Engine owns scoped execution, session metadata, approvals,
snapshot ordering, filesystem review, and process cleanup only on host shutdown.
