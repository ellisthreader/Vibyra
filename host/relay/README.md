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
