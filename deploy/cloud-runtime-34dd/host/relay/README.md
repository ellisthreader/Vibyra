# Vibyra relay

The Vibyra Cloud leg of remote access: computers connect *outward* to this
service and hold the socket; phones connect to it with a grant from the Vibyra
API and are paired with the computer they name. Every payload between the two
is a Noise-encrypted frame the relay forwards without reading. It reports only
presence — which computers are online, when a phone's session starts and ends —
to the API. See `host/docs/protocol.md` ("Relay").

## Run

```bash
npm ci
VIBYRA_RELAY_SECRET=<32+ chars, shared with the API> VIBYRA_API_URL=https://api.example \
  PORT=8788 BIND_ADDRESS=0.0.0.0 npm start
```

- `VIBYRA_RELAY_SECRET` (required in the product path): verifies the tokens the
  API signs and authenticates this relay to the API's `/api/remote/relay/events`
  and the API to this relay's `/admin/*`.
- `VIBYRA_API_URL`: where presence is reported. Unset, nothing is reported (a
  local relay, or the tests).
- `VIBYRA_RELAY_HOST_TOKENS`: JSON of host id → SHA-256 hex of a static token,
  for a standalone Host run by hand with `--relay-token-file`. Such a host
  registers under a synthetic account no phone token can match.
- `PORT` / `BIND_ADDRESS`: defaults `8788` / `127.0.0.1`. The Dockerfile binds
  `0.0.0.0`.

`GET /health` answers `{ok, relayId, hosts}`. `GET /admin/presence` and
`POST /admin/disconnect {hostId, clientId?}` need `Authorization: Bearer
<secret>`. Deploy with `railway.json` here (Docker build, `/health` check) and
put it behind TLS so its public address is `wss://`.

## Test

```bash
npm test
```

## Secure control-plane rollout (candidate)

Deploy the matching backend generation/authorization contract before this relay.
Every production registration calls `POST /api/remote/relay/authorize` with
`{token, renewal:false}`. Existing connections renew every 60 seconds with
`renewal:true`; API outage or revocation ends their authorization within 180
seconds (plus timer scheduling), independently of paid membership. No API URL
means production admission fails closed. Test fixtures explicitly inject
`authorization:null`; this is deliberately not an environment bypass.

`VIBYRA_RELAY_SIGNING_SECRET`, `VIBYRA_RELAY_ADMIN_SECRET`, and
`VIBYRA_RELAY_REPORT_SECRET` each fall back to `VIBYRA_RELAY_SECRET` during
migration. Configure the matching backend keys before separating them. Signing rotation supports `VIBYRA_RELAY_SIGNING_KEY_ID` and optional
`VIBYRA_RELAY_SIGNING_PREVIOUS_SECRET`, `VIBYRA_RELAY_SIGNING_PREVIOUS_KEY_ID`,
and `VIBYRA_RELAY_SIGNING_PREVIOUS_UNTIL` (Unix seconds). The previous key is
refused at that deadline; unknown signed key IDs are refused. Legacy tokens
without a key ID remain accepted under current or explicitly overlapping keys.

`VIBYRA_RELAY_PREVIEW_PACING_MS=12` negotiates conservative pacing; default is
3 with the bounded data allowance. `GET /admin/diagnostics` requires the admin
credential and reports aggregate resource/failure counts without payloads or
tokens. Set `VIBYRA_RELAY_VERSION` to the immutable candidate revision.

### WebSocket admission and client migration

Only the exact `VIBYRA_RELAY_WEBSOCKET_PATH` accepts upgrades (default `/`).
Query strings, alternate paths and duplicate Origin headers are refused.
Set the backend's advertised relay URL to this same path before changing it.
Credentials belong in the first bounded registration message, never the URL.

`VIBYRA_RELAY_ALLOWED_ORIGINS` is a JSON array of exact allowed browser origins.
The default is `["http://localhost","https://localhost"]`, matching the native
phone's private runtime WebView. Native Rust clients may omit Origin; they
still need cryptographic authentication and current API authorization. Configure
browser origins explicitly, for example
`["http://localhost","https://localhost","https://app.example.com"]`.
Origins are never inferred from Host, forwarding headers or the API URL.

The maintained browser client serves its bundled transport from
`/__vibyra/transport.html` on the app origin, with a script-hash CSP and pinned
parent-window messages. Run the mobile asset build before publishing web, and
include that exact app origin in this allowlist. `VIBYRA_WEB_BASE_PATH` also
applies to the transport asset when web is hosted under a path prefix.
Older sandboxed browser builds send `Origin: null` and require a client update.
An explicit `"null"` entry can be used only for isolated development migration;
it accepts all opaque browser origins and is **not** an origin trust boundary.
Origin checking supplements token, device and session authorization.

Registration JSON is capped at 6 KiB and accepts only the existing protocol
fields. Post-registration envelopes also reject extra fields and unknown types.
Parser failures return fixed errors without echoing tokens or submitted text.

`POST /admin/disconnect {hostId,grantId}` closes only clients using that grant
and echoes `grantId` in its acknowledgement, including when no client is
present. The backend must require the echo before acknowledging its outbox job
so an older relay cannot silently interpret it as whole-host disconnection.
An eight-minute bounded local fence blocks admissions racing revocation;
durable API authorization remains authoritative across relay restarts. Signed
`sessionExpiresAt` imposes an exact connection deadline independent of the
membership deadline. The earlier of those deadlines closes the client.

Keep exactly one replica. `railway.json` specifies one and startup rejects a
configured `RAILWAY_REPLICA_COUNT`/`VIBYRA_RELAY_REPLICAS` other than one. A
provider configuration inspection remains necessary; environment checks cannot
detect an unreported external replica. `/health` is liveness, not proof of API
availability. Admission ignores forwarded IP headers; validate trusted ingress
before changing that rule. Per-peer attempts and pending unauthenticated sockets
are bounded; authenticated accounts have concurrency and byte budgets.

## Local performance investigation

`node scripts/benchmark.mjs` runs 30 paired/interleaved samples per pacing
setting with identical deterministic 512 KiB payloads, ordered frame/hash
validation and a synthetic terminal-size marker. It reports local transport
latency, not real encrypted application/cellular performance. Use
`RUNS=1 SOAK_SECONDS=7200 node scripts/benchmark.mjs` for a two-hour connection
churn soak; this is not a long-lived session or eight-phone fairness soak.
`node scripts/encoding-benchmark.mjs` compares JSON/base64 encoding costs with
a hypothetical binary envelope. It does not ship a new protocol.
