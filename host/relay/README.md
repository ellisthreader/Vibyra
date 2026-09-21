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
