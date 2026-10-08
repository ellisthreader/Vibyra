#!/usr/bin/env bash
# Puts the sign-in app credentials for Slack, Notion, Linear, Microsoft (and Stripe Connect) on the production
# Railway service. Run it in a terminal you are sitting at (it accepts hidden credential input):
#
#   ! bash backend/scripts/set-connector-credentials.sh        # from the Claude prompt, or in Terminal without the "!"
#
# Setup steps per provider (where to click, redirect URIs, scopes): docs/connector-oauth-setup.md
#
# It asks which providers you want, then for each one the Client ID and Client Secret with hidden input. Nothing you
# type is echoed, written to disk, put on a command line or kept in shell history; secrets reach Railway on stdin.
# A provider you leave blank is skipped. It prints variable NAMES only, never values.
set -euo pipefail

PROJECT_ID=${CONNECTOR_PROJECT_ID:-4e292f83-b6e3-4556-a1db-69a39a2be3b2}
ENVIRONMENT_ID=${CONNECTOR_ENVIRONMENT_ID:-8d678e46-a6f9-43a7-b192-3da614d82471}
SERVICE=${CONNECTOR_SERVICE_ID:-17d27bf4-6506-4545-93e3-221065d921b0}
SITE=${SITE:-https://vibyra-production.up.railway.app}
cd "$(dirname "${BASH_SOURCE[0]}")/.."

die() { echo "$*" >&2; exit 1; }
command -v railway >/dev/null || die "The railway CLI is not installed or not on PATH."

# Prompts come from the keyboard even when stdin is something else; with no terminal at all there is nowhere to type a secret.
if [ -t 0 ]; then TTY=/dev/stdin; elif : </dev/tty 2>/dev/null; then TTY=/dev/tty
else die "This needs a real terminal to type secrets into. Open Terminal and run: bash backend/scripts/set-connector-credentials.sh"; fi

ask() { # ask <hidden:0|1> <prompt>  -> REPLY (spaces and line breaks stripped: none of these values contain any)
  if [ "$1" = 1 ]; then IFS= read -r -s -p "$2" REPLY <"$TTY"; printf '\n' >&2
  else IFS= read -r -p "$2" REPLY <"$TTY"; fi
  REPLY=${REPLY//[$'\r\n\t ']/}
}

# --- 1. Say exactly where this will write, and make it be typed back.
status=$(railway status --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" 2>/dev/null) || die "railway status failed for the specified project/environment. Run 'railway login' first."
project=$(printf '%s\n' "$status" | sed -n 's/^Project: *//p' | head -1)
environment=$(printf '%s\n' "$status" | sed -n 's/^Environment: *//p' | head -1)
[ -n "$project" ] && [ -n "$environment" ] || die "Could not read the linked Railway project and environment."
railway variable list --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service "$SERVICE" --json >/dev/null 2>&1 || die "Railway has no readable service '$SERVICE' in $project/$environment."
echo "About to write Railway variables to:"
echo "  project:     $project"
echo "  environment: $environment"
echo "  service:     $SERVICE   (variables only; nothing is deployed until you say so at the end)"
ask 0 "Type the environment name ($environment) to continue, anything else cancels: "
[ "$REPLY" = "$environment" ] || die "Cancelled. Nothing was written."

existing=$(railway variable list --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service "$SERVICE" --json 2>/dev/null | python3 -c 'import json,sys; print("\n".join(json.load(sys.stdin)))') # names only
has() { grep -qx "$1" <<<"$existing"; }

PENDING=()
SLUGS=()
trap 'unset ${!V_*} 2>/dev/null || true' EXIT

# remember <VAR_NAME> <value>: held in memory until the write step, never printed
remember() { printf -v "V_$1" '%s' "$2"; PENDING+=("$1"); }

# --- 2. One block per provider.
provider() { # provider <Label> <ID_VAR> <SECRET_VAR> <slugs> <id-hint> <secret-hint>
  local label=$1 idvar=$2 secretvar=$3 note=""
  has "$idvar" && has "$secretvar" && note=" (already set on Railway: answering replaces it)"
  ask 0 "Set up $label?$note [y/N] "
  [[ "$REPLY" =~ ^[Yy] ]] || return 0
  ask 1 "  $label Client ID ($5), hidden: "; local id=$REPLY
  ask 1 "  $label Client Secret ($6), hidden: "; local secret=$REPLY
  if [ -z "$id" ] || [ -z "$secret" ]; then echo "  left blank: $label skipped."; return 0; fi
  check "$label" "$id" "$secret"
  remember "$idvar" "$id"; remember "$secretvar" "$secret"; SLUGS+=($4)
}

# Catch the usual wrong-field pastes without ever printing what was typed.
check() {
  case "$1" in
    Microsoft)
      [[ "$2" =~ ^[0-9a-fA-F-]{36}$ ]] || echo "  warning: the Microsoft Client ID should be a GUID (Application (client) ID)."
      [[ "$3" =~ ^[0-9a-fA-F-]{36}$ ]] && echo "  warning: that secret looks like the secret's *ID*; Entra shows the usable *Value* only once, at creation." ;;
    Stripe)
      [[ "$2" == ca_* ]] || echo "  warning: a Stripe Connect client id starts with ca_."
      [[ "$3" == sk_* || "$3" == rk_* ]] || echo "  warning: the Stripe key should be a secret key (sk_...)." ;;
  esac
  return 0 # Warnings must not abort valid Microsoft credentials under set -e.
}

provider "Slack" CHAT_CONNECTORS_SLACK_CLIENT_ID CHAT_CONNECTORS_SLACK_CLIENT_SECRET "slack" "app Basic Information" "app Basic Information"
case " ${PENDING[*]:-} " in *CHAT_CONNECTORS_SLACK_CLIENT_ID*)
  ask 1 "  Slack Signing Secret (Basic Information, verifies @mention events; Enter to skip), hidden: "
  [ -n "$REPLY" ] && remember SLACK_SIGNING_SECRET "$REPLY" ;;
esac
provider "Notion" CHAT_CONNECTORS_NOTION_CLIENT_ID CHAT_CONNECTORS_NOTION_CLIENT_SECRET "notion" "OAuth client ID" "OAuth client secret"
provider "Linear" CHAT_CONNECTORS_LINEAR_CLIENT_ID CHAT_CONNECTORS_LINEAR_CLIENT_SECRET "linear" "app Client ID" "app Client secret"
provider "Microsoft" CHAT_CONNECTORS_MICROSOFT_CLIENT_ID CHAT_CONNECTORS_MICROSOFT_CLIENT_SECRET \
  "outlook_mail outlook_calendar onedrive teams sharepoint" "Application (client) ID" "client secret Value"
provider "Stripe" CHAT_CONNECTORS_STRIPE_CLIENT_ID CHAT_CONNECTORS_STRIPE_SECRET_KEY "stripe" "Connect client_id, ca_..." "platform secret key, same live/test mode"

[ "${#PENDING[@]}" -gt 0 ] || die "Nothing to write. Nothing was changed."

# --- 3. Confirm the list of names, then write.
echo; echo "Will set on $project/$environment/$SERVICE:"
for name in "${PENDING[@]}"; do echo "  $name"; done
ask 0 "Write these now? [y/N] "
[[ "$REPLY" =~ ^[Yy] ]] || die "Cancelled. Nothing was written."

setvar() { # setvar <NAME>  (value comes from memory and travels on stdin only)
  local var="V_$1"
  if printf '%s' "${!var}" | railway variable set "$1" --stdin --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service "$SERVICE" --skip-deploys >/dev/null 2>&1; then
    echo "  set  $1"
  else echo "  FAILED to set $1 (Railway refused it; the value was not printed)" >&2; return 1; fi
}
failed=0
for name in "${PENDING[@]}"; do setvar "$name" || failed=1; done
[ "$failed" = 0 ] || die "Some variables were not set (see FAILED above). Re-run to retry just those."

# --- 4. Variables only take effect on a new deploy.
echo; echo "The variables are saved but not live until the service restarts."
ask 0 "Redeploy $SERVICE now? [y/N] "
if [[ "$REPLY" =~ ^[Yy] ]]; then
  railway redeploy -y --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service "$SERVICE" >/dev/null 2>&1 || die "Redeploy failed for the specified production service."
  echo "  waiting for configured connector JSON from $SITE/api/connectors ..."
  ready=0
  for _ in $(seq 1 40); do
    if curl -fsS -m 10 "$SITE/api/connectors" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    configured = {i["id"] for i in data.get("integrations", []) if i.get("credential", {}).get("configured")}
    sys.exit(0 if data.get("enabled") and set(sys.argv[1:]).issubset(configured) else 1)
except (ValueError, KeyError, TypeError):
    sys.exit(1)
' "${SLUGS[@]}"; then ready=1; break; fi
    sleep 6
  done
  [ "$ready" = 1 ] || die "Connector JSON did not become ready. Credentials are saved; check deployment health before testing sign-in."
  echo "Sign-in availability now (public catalogue; 'configured' means the credentials are present, not that the provider app is right):"
  curl -s -m 20 "$SITE/api/connectors" | python3 -c '
import json, sys
want = set(sys.argv[1:])
for i in json.load(sys.stdin).get("integrations", []):
    if i["id"] in want: print("  %-17s configured=%s" % (i["id"], i["credential"]["configured"]))
' "${SLUGS[@]}" 2>/dev/null || echo "  (could not read it; check: curl $SITE/api/connectors)"
else
  echo "Redeploy when ready: railway redeploy -y --project $PROJECT_ID --environment $ENVIRONMENT_ID --service $SERVICE"
fi
echo "Next: test one sign-in per provider on your iPhone. Steps and expected redirects: docs/connector-oauth-setup.md"
