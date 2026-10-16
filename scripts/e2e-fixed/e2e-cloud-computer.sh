#!/usr/bin/env bash
# Local end-to-end proof of the cloud computer, no Fly/production: real vibyra-host (account mode) <-> local Laravel
# (throwaway sqlite, FAKE provider, fake GitHub) <-> local host/relay <-> a Node "phone" (real Noise WASM), plus the VM
# supervisor code from cloud-runtime and its git credential helper/hook.
# Run:  bash scripts/e2e-cloud-computer.sh            (needs php, node, cargo; ports 8031 and 8789 free)
#       E2E_IDLE=1 bash scripts/e2e-cloud-computer.sh  also proves idle-stop (~2 min)
# Never reads backend/.env, touches no running server, deletes everything it made on exit.
# NOTE: the Host refuses a non-wss relay address from the account API and the backend only advertises wss, and
# the local relay has no TLS. So the script builds the Host from a SCRATCH COPY of host/ with one line patched to
# rewrite wss://127.0.0.1:<port> to ws://127.0.0.1:<port>. The repo and the shipped binary are not changed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
W="$(mktemp -d /tmp/e2e-cc-XXXXXX)"          # short path: unix sockets are limited to ~100 bytes
export D="$W" API=http://127.0.0.1:8031 RELAY_PORT=8789
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; pkill -f -- "-S 127.0.0.1:8031 $ROOT/scripts/e2e-cloud-computer-boot.php" 2>/dev/null || true; pkill -f "$W/" 2>/dev/null || true; rm -rf "$W"; }
trap cleanup EXIT
for port in 8031 8789; do ! lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1 || { echo "port $port busy"; exit 1; }; done

export DEVELOPER_DIR=/Library/Developer/CommandLineTools SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk CC=/Library/Developer/CommandLineTools/usr/bin/clang
export CFLAGS="-isysroot $SDKROOT"; export PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH
if [ -z "${E2E_HOST_BIN:-}" ]; then
  mkdir -p "$W/repo/desktop-tauri/src-tauri/crates" "$W/repo/desktop-tauri/src-tauri/src"
  rsync -a --exclude target host/ "$W/repo/host/"
  rsync -a --exclude target desktop-tauri/src-tauri/crates/vibyra-core "$W/repo/desktop-tauri/src-tauri/crates/"
  cp desktop-tauri/src-tauri/Cargo.toml "$W/repo/desktop-tauri/src-tauri/"; : > "$W/repo/desktop-tauri/src-tauri/src/lib.rs"
  node -e '
    const fs=require("fs"),f=process.argv[1];let s=fs.readFileSync(f,"utf8");
    s=s.replace(`reply["relayUrl"].as_str().unwrap_or_default().to_owned();`,`reply["relayUrl"].as_str().unwrap_or_default().replacen("wss://127.0.0.1:", "ws://127.0.0.1:", 1); // E2E-ONLY`);
    s=s.replace(`if !url.starts_with("wss://") {`,`if !url.starts_with("wss://") && !url.starts_with("ws://127.0.0.1:") {`);
    if(!s.includes("E2E-ONLY")||!s.includes("&& !url.starts_with(\"ws://127")) throw Error("host patch did not apply");
    fs.writeFileSync(f,s)' "$W/repo/host/crates/server/src/account_source.rs"
  (cd "$W/repo/host" && CARGO_TARGET_DIR="${E2E_TARGET:-$HOME/.cache/vibyra-e2e-host-target}" cargo build --offline -p vibyra-host)
  E2E_HOST_BIN="${E2E_TARGET:-$HOME/.cache/vibyra-e2e-host-target}/debug/vibyra-host"
fi
# The Desktop owns 4318 on a dev Mac: bind a free port, and make an idle terminal stop counting after 60 s.
printf '#!/bin/sh\nexec %s "$@" --listen 127.0.0.1:0 --idle-session-secs 60\n' "$E2E_HOST_BIN" > "$W/host.sh"; chmod +x "$W/host.sh"

# ---- backend env (process env only) ----
export APP_ENV=local APP_DEBUG=true APP_KEY="base64:$(openssl rand -base64 32)"
export E2E_DB="$W/e2e-db.sqlite" DB_CONNECTION=sqlite DB_DATABASE="$W/e2e-db.sqlite"; : > "$E2E_DB"
export APP_URL=$API QUEUE_CONNECTION=sync CACHE_STORE=file CACHE_DRIVER=file SESSION_DRIVER=file MAIL_MAILER=log LOG_CHANNEL=stderr
export CLOUD_WORKSPACES_ENABLED=true CLOUD_WORKSPACES_UI_ENABLED=true CLOUD_WORKSPACES_STARTS_ENABLED=true CLOUD_WORKSPACES_AI_ENABLED=true
export CLOUD_WORKSPACES_PROVIDER_AUDIT_REQUIRED=false CLOUD_WORKSPACES_UNITS_PER_HOUR=120000 CLOUD_WORKSPACES_PROVIDER_MICRO_PER_HOUR=91700
export CLOUD_WORKSPACES_TARIFF_VERSION=e2e-v1 CLOUD_WORKSPACES_DAILY_MICRO_LIMIT=100000000 CLOUD_WORKSPACES_FLY_TOKEN=fake CLOUD_WORKSPACES_FLY_ORG=fake
export CLOUD_WORKSPACES_IMAGE="registry.invalid/runtime@sha256:$(printf 'a%.0s' {1..64})" CLOUD_WORKSPACES_API_ORIGIN=$API CLOUD_WORKSPACES_QUEUE_CONNECTION=sync
export CLOUD_WORKSPACES_LEASE_PRIVATE_KEY="$(node -e 'const c=require("crypto");const k=c.generateKeyPairSync("ed25519");console.log(Buffer.concat([k.privateKey.export({type:"pkcs8",format:"der"}).subarray(-32),k.publicKey.export({type:"spki",format:"der"}).subarray(-32)]).toString("base64"))')"
export VIBYRA_RELAY_URL=wss://127.0.0.1:$RELAY_PORT VIBYRA_RELAY_ADMIN_URL=http://127.0.0.1:$RELAY_PORT VIBYRA_RELAY_SECRET="$(openssl rand -hex 32)" VIBES_REMOTE_ACCESS_LIVE=true
export VIBES_ENABLED=true VIBYRA_FUNDED_TERMINALS_ENABLED=true OPENROUTER_API_KEY=fake LEGAL_MARKET_ENFORCEMENT=false CLOUD_WORKSPACES_PILOT_USERS=1
export CLOUD_GITHUB_APP_ID=424242 CLOUD_GITHUB_APP_PUSH_ENABLED=true CLOUD_GITHUB_APP_PRIVATE_KEY="$(openssl genrsa 2048 2>/dev/null)"
export E2E_FAKE_GITHUB=1 E2E_IDLE_SECONDS="${E2E_IDLE:+45}"; E2E_IDLE_SECONDS="${E2E_IDLE_SECONDS:-600}"; export PHP_CLI_SERVER_WORKERS=4
BOOT="php $ROOT/scripts/e2e-cloud-computer-boot.php"
$BOOT artisan migrate --force >/dev/null
SEED="$($BOOT run scripts/e2e-cloud-computer-seed.php | tail -1)"; TOKEN="$(node -pe 'JSON.parse(process.argv[1]).token' "$SEED")"
(cd backend/public && exec php -S 127.0.0.1:8031 "$ROOT/scripts/e2e-cloud-computer-boot.php" >"$W/backend.log" 2>&1) & PIDS+=($!)
(cd host/relay && PORT=$RELAY_PORT VIBYRA_API_URL=$API exec node src/main.mjs >"$W/relay.log" 2>&1) & PIDS+=($!)
sleep 2
api() { local out code; out="$(curl -s -w '\nHTTPCODE%{http_code}' -X"$1" -H "Authorization: Bearer $TOKEN" -H 'Accept: application/json' -H 'Content-Type: application/json' ${3:+-d "$3"} "$API$2")"; code="${out##*HTTPCODE}"; out="${out%HTTPCODE*}"; if [ "$code" = 000 ] || [ "$code" -ge 400 ]; then echo "api $1 $2 -> HTTP $code: ${out:0:800}" >&2; return 22; fi; printf '%s' "$out"; } # same failure rule as curl -f, but prints the body
field() { node -pe "const j=JSON.parse(require('fs').readFileSync(0));$1"; }
step() { echo; echo "== $*"; }

step "create + wake (fake provider), play the VM supervisor with the real cloud-runtime code"
CID="$(uuidgen | tr A-Z a-z)"
api POST /api/cloud-computer "{\"id\":\"$CID\",\"name\":\"e2e\"}" >/dev/null
api POST /api/cloud-computer/wake '{"acceptTerms":true}' | field 'j.computer.state'
cat > "$W/reconcile.php" <<PHP
<?php app(App\Services\CloudWorkspaces\Lifecycle::class)->reconcile(\$argv[3]);
PHP
$BOOT run "$W/reconcile.php" "$CID"
echo '<?php echo DB::table("cloud_workspaces")->first()->generation, " ", Crypt::decryptString(DB::table("cloud_workspaces")->first()->bootstrap_secret), "\n";' > "$W/secret.php"
read -r GEN BS < <($BOOT run "$W/secret.php" | tail -1)
mkdir -p "$W/home"
E2E_API=$API E2E_WORKSPACE=$CID E2E_DIR=$W E2E_GENERATION=$GEN E2E_MACHINE=fake-machine E2E_BOOTSTRAP=$BS E2E_HOST_BIN="$W/host.sh" HOME="$W/home" \
  node scripts/e2e-cloud-computer-supervisor.mjs >"$W/supervisor.log" 2>&1 & PIDS+=($!)
for i in $(seq 1 40); do [ "$(curl -s $API/api/cloud-computer -H "Authorization: Bearer $TOKEN" -H Accept:application/json | field 'j.computer.online')" = true ] && break; sleep 1; done
curl -s 127.0.0.1:$RELAY_PORT/health; echo
api GET /api/cloud-computer | field 'JSON.stringify({state:j.computer.state,online:j.computer.online,hostId:j.computer.hostId&&j.computer.hostId.slice(0,12)})'
api GET /api/remote/hosts | field 'JSON.stringify(j.computers.map(c=>({kind:c.kind,online:c.online,cloudState:c.cloudState})))'

step "git: credential helper + proxy + hook + backend routes (fake GitHub)"
$BOOT run scripts/e2e-cloud-computer-github-seed.php "$CID" >/dev/null
E2E_API=$API E2E_WORKSPACE=$CID E2E_DIR=$W E2E_TOKEN=$TOKEN node scripts/e2e-cloud-computer-git.mjs

step "clone queue + login detection"
api POST /api/cloud-computer/projects '{"name":"demo"}' >/dev/null
mkdir -p "$W/home/.claude"; echo '{"x":1}' > "$W/home/.claude/.credentials.json"
sleep 18; api GET /api/cloud-computer | field 'JSON.stringify({login:j.computer.login,projects:j.computer.projects})'

step "phone: register device, passkey (fixture) approval, relay grant, Noise, terminal"
E2E_API=$API E2E_TOKEN=$TOKEN E2E_STRONG_CMD="$BOOT run $ROOT/scripts/e2e-cloud-computer-strong.php" node scripts/e2e-cloud-computer-phone.mjs
echo "-- negative: no passkey -> device approval refused"
NEG="$(E2E_API=$API E2E_TOKEN=$TOKEN node scripts/e2e-cloud-computer-phone.mjs 2>&1 || true)"
case "$NEG" in *cloud_passkey_required*) echo "PASS refused without passkey";; *) echo "FAIL: approval without passkey was not refused"; exit 1;; esac
sleep 16; api GET /api/cloud-computer | field 'JSON.stringify({state:j.computer.state,sessionsActive:j.computer.sessionsActive})'

if [ -n "${E2E_IDLE:-}" ]; then
  step "idle stop (Host idle 60 s, backend idle 45 s)"
  for i in $(seq 1 30); do st="$(sqlite3 "$E2E_DB" 'select state||"/"||coalesce(stop_reason,"") from cloud_workspaces')"; [ "$st" = "stopping/idle" ] && break; sleep 10; done
  echo "state: $st"; [ "$st" = "stopping/idle" ] || { echo "FAIL idle stop"; exit 1; }
  $BOOT run "$W/reconcile.php" "$CID"; api GET /api/cloud-computer | field 'j.computer.state'
  curl -s -XPOST -H "Authorization: Bearer $TOKEN" -H Accept:application/json -d '{}' $API/api/remote/hosts/$(api GET /api/cloud-computer | field 'j.computer.hostId')/connect
fi
echo; echo "E2E OK"
