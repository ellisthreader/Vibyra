#!/usr/bin/env bash
# Local end-to-end proof of cloud SYNC across the three independently written halves: the Mac engine (vibyra-sync CLI)
# <-> the real Laravel backend (throwaway sqlite, local disk) <-> the VM sync engine (cloud-runtime, temp data dir).
# No Fly, no production, nothing exposed beyond 127.0.0.1:8032. Run: bash scripts/e2e-cloud-sync.sh
# Set VIBYRA_E2E_FILES_ONLY=1 for file/Git acceptance without changing HOME or reading transcripts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
W="$(mktemp -d /tmp/e2e-sync-XXXXXX)"; API=http://127.0.0.1:8032; PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done; rm -rf "$W"; }
trap cleanup EXIT
! lsof -nP -iTCP:8032 -sTCP:LISTEN >/dev/null 2>&1 || { echo "port 8032 busy"; exit 1; }
export CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS:-2}
export DEVELOPER_DIR=/Library/Developer/CommandLineTools SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX.sdk CC=/Library/Developer/CommandLineTools/usr/bin/clang
export CFLAGS="-isysroot $SDKROOT"; export PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH
export APP_ENV=local APP_DEBUG=true APP_KEY="base64:$(openssl rand -base64 32)" E2E_DB="$W/e2e-db.sqlite" DB_CONNECTION=sqlite DB_DATABASE="$W/e2e-db.sqlite"
: > "$E2E_DB"
export APP_URL=$API QUEUE_CONNECTION=sync CACHE_STORE=file CACHE_DRIVER=file SESSION_DRIVER=file MAIL_MAILER=log LOG_CHANNEL=stderr
unset PHP_CLI_SERVER_WORKERS
export CLOUD_WORKSPACES_ENABLED=true CLOUD_WORKSPACES_STARTS_ENABLED=true CLOUD_WORKSPACES_PROVIDER_AUDIT_REQUIRED=false CLOUD_WORKSPACES_UNITS_PER_HOUR=120000
export CLOUD_WORKSPACES_PROVIDER_MICRO_PER_HOUR=91700 CLOUD_WORKSPACES_TARIFF_VERSION=e2e-v1 CLOUD_WORKSPACES_DAILY_MICRO_LIMIT=100000000 CLOUD_WORKSPACES_FLY_TOKEN=fake CLOUD_WORKSPACES_FLY_ORG=fake
export CLOUD_WORKSPACES_IMAGE="registry.invalid/runtime@sha256:$(printf 'a%.0s' {1..64})" CLOUD_WORKSPACES_API_ORIGIN=$API VIBES_ENABLED=true OPENROUTER_API_KEY=fake LEGAL_MARKET_ENFORCEMENT=false
export CLOUD_SYNC_DISK_ROOT="$W/sync-disk" VIBES_REMOTE_ACCESS_LIVE=true VIBYRA_RELAY_URL=wss://127.0.0.1:1 VIBYRA_RELAY_SECRET="$(openssl rand -hex 32)"
BOOT="php $ROOT/scripts/e2e-cloud-computer-boot.php"
$BOOT artisan migrate --force >/dev/null
SEED="$($BOOT run scripts/e2e-cloud-sync-seed.php | tail -1)"
WS="$(node -pe 'JSON.parse(process.argv[1]).workspace' "$SEED")"; RT="$(node -pe 'JSON.parse(process.argv[1]).runtime' "$SEED")"
# Same PHP limits as staging/production need (scripts/fly-staging/Dockerfile): the VM returns whole snapshots in one request.
(cd backend/public && exec php -d post_max_size=600M -d upload_max_filesize=600M -S 127.0.0.1:8032 "$ROOT/scripts/e2e-cloud-computer-boot.php" >"$W/backend.log" 2>&1) & PIDS+=($!)
sleep 2
step() { echo; echo "== $*"; }; ok() { echo "   ok: $*"; }; fail() { echo "   FAIL: $*"; echo "--- backend log tail"; tail -15 "$W/backend.log"; exit 1; }

step "build the Mac sync CLI"
(cd desktop-tauri/src-tauri && cargo build -q -p vibyra-sync --bin vibyra-sync)
CLI="$ROOT/desktop-tauri/src-tauri/target/debug/vibyra-sync"; [ -x "$CLI" ] || CLI="$(cd desktop-tauri/src-tauri && cargo metadata --format-version 1 --no-deps | node -pe 'JSON.parse(require("fs").readFileSync(0)).target_directory')/debug/vibyra-sync"
export VIBYRA_SYNC_STATE_DIR="$W/mac-state"
# The Mac engine reads Claude/Codex conversations from $HOME: give it a throwaway home, never the real one.
SYNC_ARGS=()
if [ "${VIBYRA_E2E_FILES_ONLY:-0}" = 1 ]; then
  SYNC_ARGS=(--no-transcripts)
else
  mkdir -p "$W/fakehome"; export HOME="$W/fakehome"
fi
mkdir -p "$W/mac-state"

step "Mac: sign in, register this Mac"
printf 'e2e-password-123\n' | "$CLI" login --api $API --email e2e-sync@example.invalid --password-stdin >/dev/null || fail "login"
"$CLI" register-mac >/dev/null || fail "register-mac"; ok "registered"

step "VM: publish its key (drain with nothing pending)"
mkdir -p "$W/vm"
node scripts/e2e-cloud-sync.mjs drain $API "$WS" "$RT" "$W/vm" >/dev/null 2>"$W/vm1.log" || { cat "$W/vm1.log"; fail "vm start"; }
"$CLI" status | grep -q "cloud key ready: true" && ok "VM key visible to the Mac" || fail "VM key not published"

step "Mac: a project with committed-looking files, an uncommitted edit, an ignored file and a secret"
P="$W/mac/myproj"; mkdir -p "$P/src" "$P/node_modules/x"
printf 'node_modules/\nbuild/\n' > "$P/.gitignore"; printf 'console.log("v1")\n' > "$P/src/index.js"; printf 'hello\n' > "$P/README.md"
printf 'junk\n' > "$P/node_modules/x/i.js"; printf 'SECRET=abc\n' > "$P/.env"; printf -- '-----BEGIN PRIVATE KEY-----\nxx\n-----END PRIVATE KEY-----\n' > "$P/deploy.key"
P_REAL="$(cd "$P" && pwd -P)"
# Nothing syncs until the person ticks the project (the phone's tick; the server hashes the Mac project id itself).
TOKEN="$(cat "$VIBYRA_SYNC_STATE_DIR/cli-token")"
curl -sf -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Accept: application/json" "$API/api/cloud-computer/access/projects" \
  -d "{\"projects\":[{\"id\":\"$P_REAL\",\"name\":\"myproj\",\"allowed\":true}]}" >/dev/null || fail "tick the project for Vibyra Cloud"
if [ "${VIBYRA_E2E_FILES_ONLY:-0}" != 1 ]; then
CID="$(uuidgen | tr A-Z a-z)"; CDIR="$HOME/.claude/projects/$(printf '%s' "$P_REAL" | sed 's/[^A-Za-z0-9]/-/g')"; mkdir -p "$CDIR"
printf '{"type":"user","sessionId":"%s","cwd":"%s","uuid":"u1","parentUuid":null,"message":{"role":"user","content":"E2E-CONVERSATION remember pineapple"},"timestamp":"2026-10-02T10:00:00Z"}\n' "$CID" "$P_REAL" > "$CDIR/$CID.jsonl"
fi
"$CLI" once "$P" ${SYNC_ARGS[@]+"${SYNC_ARGS[@]}"} | tee "$W/once.out"; grep -qiE "uploaded|synced" "$W/once.out" && ok "uploaded" || fail "upload did not report success"

step "VM: drain, files must appear exactly (no ignored, no secrets)"
node scripts/e2e-cloud-sync.mjs drain $API "$WS" "$RT" "$W/vm" 2>"$W/vm2.log" | tee "$W/drain.out"
V="$W/vm/projects"; NAME="$(ls "$V" | grep -v '^\.' | head -1)"; [ -n "$NAME" ] || { cat "$W/vm2.log"; fail "no project on the VM"; }
[ "$(cat "$V/$NAME/src/index.js")" = 'console.log("v1")' ] && ok "src/index.js identical" || fail "index.js differs"
[ -f "$V/$NAME/README.md" ] && ok "README present" || fail "README missing"
[ ! -e "$V/$NAME/node_modules" ] && ok "ignored folder not sent" || fail "node_modules leaked"
[ ! -e "$V/$NAME/.env" ] && ok ".env held back" || fail ".env leaked"
[ ! -e "$V/$NAME/deploy.key" ] && ok "private key held back" || fail "private key leaked"
if [ "${VIBYRA_E2E_FILES_ONLY:-0}" != 1 ]; then
VROOT="$W/vm/projects/$NAME"; VT="$W/vm/home/.claude/projects/$(printf '%s' "$VROOT" | sed 's/[^A-Za-z0-9]/-/g')/$CID.jsonl"
[ -f "$VT" ] && ok "Claude conversation placed for the cloud project" || { ls -R "$W/vm/home" 2>/dev/null | head -20; fail "conversation not on the VM"; }
grep -q "\"cwd\":\"$VROOT\"" "$VT" && grep -q "E2E-CONVERSATION" "$VT" && ok "its folder path rewritten to the cloud folder" || { head -c 400 "$VT"; fail "cwd not rewritten"; }
fi

step "Mac: second edit uploads an incremental bundle, VM applies it"
printf 'console.log("v2")\n' > "$P/src/index.js"; rm "$P/README.md"; printf 'new\n' > "$P/src/new.js"
head -c 20971520 /dev/urandom > "$P/assets.bin"   # incompressible 20 MiB: the upload goes in resumable 8 MiB pieces
"$CLI" once "$P" ${SYNC_ARGS[@]+"${SYNC_ARGS[@]}"} >/dev/null || fail "second upload"
node scripts/e2e-cloud-sync.mjs drain $API "$WS" "$RT" "$W/vm" 2>>"$W/vm2.log" >/dev/null
[ "$(cat "$V/$NAME/src/index.js")" = 'console.log("v2")' ] && [ -f "$V/$NAME/src/new.js" ] && [ ! -e "$V/$NAME/README.md" ] && ok "edit, add and delete applied" || fail "incremental apply wrong"
cmp -s "$P/assets.bin" "$V/$NAME/assets.bin" && ok "a 20 MiB file arrived intact through the resumable piece upload" || fail "big file missing or different"

step "phone view: the account state reports the project as synced"
TOKEN="$(cat "$W/mac-state/cli-token" 2>/dev/null || cat "$VIBYRA_SYNC_STATE_DIR"/*/cli-token)"
STATE="$(curl -sf -H "Authorization: Bearer $TOKEN" -H Accept:application/json $API/api/cloud-computer)"
echo "$STATE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const p=(j.computer.projects||[]).find(x=>x.syncState);console.log(JSON.stringify({syncState:p&&p.syncState,syncedAt:p&&p.syncedAt,source:p&&p.source,sync:j.computer.sync}));process.exit(p&&p.syncState==="synced"?0:1)})' && ok "synced + syncedAt visible" || fail "state does not show synced"

step "VM: an edit made in the cloud returns to the Mac"
node scripts/e2e-cloud-sync.mjs edit-and-return $API "$WS" "$RT" "$W/vm" "$NAME" src/index.js 'console.log("from the cloud")
' 2>>"$W/vm2.log" | tee "$W/ret.out"; grep -q "true" "$W/ret.out" && ok "VM sent a return snapshot" || { cat "$W/vm2.log" | tail; fail "VM did not send"; }
"$CLI" down | tee "$W/down.out"; grep -qi "index.js" "$W/down.out" && ok "Mac sees the cloud change" || fail "Mac did not see the change"
"$CLI" down-apply "$P" | tee "$W/apply.out" || fail "down-apply refused"
[ "$(cat "$P/src/index.js")" = 'console.log("from the cloud")' ] && ok "cloud edit applied to the Mac folder" || fail "Mac file not updated"
# ---- the way back (docs/cloud-switching-contract.md "Implementation notes - return") -------------------------------------
VMDIR="$W/vm"; BACKUPS="$VIBYRA_SYNC_STATE_DIR/cloud-backups"
vm() { node scripts/e2e-cloud-sync.mjs "$1" $API "$WS" "$RT" "$VMDIR" "${@:2}" 2>>"$W/vm2.log"; }
step "Mac: both sides share a base; the cloud edits two files, this Mac edits one of them too"
"$CLI" once "$P" ${SYNC_ARGS[@]+"${SYNC_ARGS[@]}"} >/dev/null || fail "upload before the cloud edits"; vm drain >/dev/null
vm edit-and-return "$NAME" src/new.js 'cloud new content
' src/index.js 'cloud edit of index
' | grep -q true || fail "VM did not return its edits"
printf 'mac edit of index\n' > "$P/src/index.js"
"$CLI" down | tee "$W/down2.out" >/dev/null; grep -q "new.js" "$W/down2.out" && grep -q "index.js" "$W/down2.out" && ok "Mac sees both cloud files" || fail "cloud files not seen"
set +e; "$CLI" down-safe "$P" | tee "$W/safe.out" >/dev/null; SAFE_CODE=$?; set -e
[ "$(cat "$P/src/new.js")" = 'cloud new content' ] && ok "the file only the cloud changed was applied automatically" || fail "cloud-only file not applied"
[ "$SAFE_CODE" = 2 ] && grep -q "conflict src/index.js" "$W/safe.out" && [ "$(cat "$P/src/index.js")" = 'mac edit of index' ] && ok "the true conflict waited and the Mac file is untouched" || { cat "$W/safe.out"; fail "conflict handled wrongly"; }
BK="$(sed -n 's/^backup //p' "$W/safe.out" | head -1)"; [ -n "$BK" ] && [ -d "$BK" ] && ok "a backup was made before anything was written" || fail "no backup folder"
"$CLI" down-resolve "$P" src/index.js cloud | tee "$W/resolve.out" >/dev/null
[ "$(cat "$P/src/index.js")" = 'cloud edit of index' ] && ok "take-cloud wrote the cloud's version" || fail "take-cloud failed"
RB="$(sed -n 's/^backup //p' "$W/resolve.out" | head -1)"; [ "$(cat "$RB/original/src/index.js")" = 'mac edit of index' ] && ok "the Mac's version was backed up first" || fail "original not backed up"
"$CLI" down-safe "$P" | grep -q "settled true" && ok "nothing left to decide: the change settled" || fail "change not settled"
"$CLI" once "$P" ${SYNC_ARGS[@]+"${SYNC_ARGS[@]}"} >/dev/null || fail "upload after resolving"; vm drain >/dev/null
[ "$(cat "$VMDIR/projects/$NAME/src/index.js")" = 'cloud edit of index' ] && ok "the cloud folder follows what was decided" || fail "VM differs after resolving"

step "git: a commit made in the cloud comes back as a vibyra/cloud-* branch, nothing checked out moves"
(cd "$P" && git init -q -b main && git config user.email e2e@example.invalid && git config user.name e2e && git add .gitignore src && git commit -q -m "mac base")
"$CLI" once "$P" ${SYNC_ARGS[@]+"${SYNC_ARGS[@]}"} >/dev/null || fail "upload with a repository"; vm drain >/dev/null
for ANCESTRY in related unrelated; do
GIT_FILE="src/from-git-$ANCESTRY.js"
vm commit-and-return "$NAME" "$P" "$ANCESTRY" "$GIT_FILE" 'console.log("committed in the cloud")
' > "$W/gitret.out"
node - "$W/gitret.out" "$ANCESTRY" "$(git -C "$P" rev-parse HEAD)" <<'NODE' || fail "wrong returned Git ancestry"
const fs = require('node:fs'), assert = require('node:assert/strict');
const [file, ancestry, head] = process.argv.slice(2); const result = JSON.parse(fs.readFileSync(file));
assert.equal(result.sent, true); assert.equal(result.git.unrelated, ancestry === 'unrelated');
assert.equal(result.git.base, ancestry === 'related' ? head : null);
assert.equal(result.git.commits, ancestry === 'related' ? 1 : 2);
NODE
ok "VM returned the explicit $ANCESTRY commit fixture"
HEAD_BEFORE="$(git -C "$P" rev-parse HEAD)"; BRANCH_BEFORE="$(git -C "$P" rev-parse --abbrev-ref HEAD)"; STATUS_BEFORE="$(git -C "$P" status --porcelain)"
"$CLI" down | tee "$W/down3.out" >/dev/null; grep -qE "git [1-9][0-9]* commit" "$W/down3.out" && ok "Mac received the $ANCESTRY commits" || { cat "$W/down3.out"; fail "no git return"; }
GID="$("$CLI" git-returns "$P" | head -1 | cut -d' ' -f1)"; [ -n "$GID" ] || fail "no git return listed"
"$CLI" git-apply "$P" "$GID" | tee "$W/gitapply.out" >/dev/null; BR="$(sed -n 's/^branch //p' "$W/gitapply.out")"
case "$BR" in vibyra/cloud-*) ok "branch $BR created";; *) fail "branch name wrong: $BR";; esac
git -C "$P" show "$BR:$GIT_FILE" | grep -q "committed in the cloud" && ok "the branch holds the cloud's commit" || fail "branch content wrong"
set +e; git -C "$P" merge-base --is-ancestor "$HEAD_BEFORE" "$BR"; ANCESTRY_CODE=$?; set -e
if [ "$ANCESTRY" = related ]; then [ "$ANCESTRY_CODE" = 0 ] || fail "related return lost its Mac ancestor";
else [ "$ANCESTRY_CODE" = 1 ] || fail "unrelated return unexpectedly shares Mac history"; fi
ok "$ANCESTRY ancestry verified in the returned branch"
[ "$(git -C "$P" rev-parse HEAD)" = "$HEAD_BEFORE" ] && [ "$(git -C "$P" rev-parse --abbrev-ref HEAD)" = "$BRANCH_BEFORE" ] && [ "$(git -C "$P" status --porcelain)" = "$STATUS_BEFORE" ] && [ ! -e "$P/$GIT_FILE" ] && ok "checked-out branch, index and working tree untouched" || fail "the checked-out work moved"
done

if [ "${VIBYRA_E2E_FILES_ONLY:-0}" = 1 ]; then
  echo; echo "ALL FILE/GIT SYNC E2E CHECKS PASSED (conversation acceptance excluded)"; exit 0
fi

step "conversations: the cloud continues one (local copy backed up), then both sides continue it (a Cloud copy, nothing lost)"
LOCAL="$CDIR/$CID.jsonl"; BEFORE_LINES="$(wc -l < "$LOCAL" | tr -d ' ')"
vm append-transcript "$NAME" "$CID" 'CLOUD-TURN-ONE' | grep -q '"sent":true' || fail "VM did not return the conversation"
"$CLI" down | tee "$W/down4.out" >/dev/null
grep -q "CLOUD-TURN-ONE" "$LOCAL" && [ "$(wc -l < "$LOCAL" | tr -d ' ')" -gt "$BEFORE_LINES" ] && ok "the cloud's turn arrived in the Mac's conversation" || { cat "$W/down4.out"; fail "conversation not updated"; }
TB="$(sed -n 's/^backup //p' "$W/down4.out" | head -1)"; [ -f "$TB" ] && ! grep -q "CLOUD-TURN-ONE" "$TB" && grep -q "E2E-CONVERSATION" "$TB" && ok "the previous local transcript was backed up first" || fail "transcript backup missing"
printf '{"type":"user","sessionId":"%s","cwd":"%s","uuid":"mac-branch","message":{"role":"user","content":"MAC-BRANCH"},"timestamp":"2026-10-14T10:00:00Z"}\n' "$CID" "$P_REAL" >> "$LOCAL"
vm append-transcript "$NAME" "$CID" 'CLOUD-BRANCH' | grep -q '"sent":true' || fail "VM did not return its branch"
"$CLI" down | tee "$W/down5.out" >/dev/null
grep -q "continued on both sides" "$W/down5.out" && ok "Mac noticed both sides continued" || { cat "$W/down5.out"; fail "no fork reported"; }
grep -q "MAC-BRANCH" "$LOCAL" && ! grep -q "CLOUD-BRANCH" "$LOCAL" && ok "the local conversation is exactly as it was" || fail "the local conversation changed"
COPY="$(grep -l "CLOUD-BRANCH" "$CDIR"/*.jsonl | grep -v "$CID" | head -1)"; [ -n "$COPY" ] && grep -q "(Cloud copy)" "$COPY" && ok "the cloud's branch is its own conversation titled (Cloud copy)" || fail "no Cloud copy"

echo; echo "ALL SYNC E2E CHECKS PASSED"
