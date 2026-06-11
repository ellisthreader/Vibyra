#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v railway >/dev/null 2>&1 || {
  echo "Railway CLI is required."
  exit 1
}

read -r -p "Google OAuth web client ID: " google_client_id
read -r -s -p "Google OAuth client secret (leave blank for PKCE-only): " google_client_secret
printf '\n'
read -r -p "Apple Services ID: " apple_client_id
read -r -p "Apple Team ID: " apple_team_id
read -r -p "Apple Sign in with Apple Key ID: " apple_key_id
read -r -p "Path to Apple .p8 private key: " apple_key_path

if [[ -z "$google_client_id" || -z "$apple_client_id" || -z "$apple_team_id" || -z "$apple_key_id" ]]; then
  echo "Google client ID and all Apple identifiers are required."
  exit 1
fi
if [[ ! -f "$apple_key_path" ]]; then
  echo "Apple private key file was not found: $apple_key_path"
  exit 1
fi

google_callback="https://vibyra-production.up.railway.app/api/auth/desktop/google/callback"
apple_callback="https://vibyra-production.up.railway.app/api/auth/desktop/apple/callback"

railway variables --service Vibyra --set \
  "GOOGLE_DESKTOP_CLIENT_ID=$google_client_id" \
  --set \
  "GOOGLE_DESKTOP_CLIENT_SECRET=$google_client_secret" \
  --set \
  "GOOGLE_DESKTOP_REDIRECT_URI=$google_callback" \
  --set \
  "APPLE_DESKTOP_CLIENT_ID=$apple_client_id" \
  --set \
  "APPLE_DESKTOP_TEAM_ID=$apple_team_id" \
  --set \
  "APPLE_DESKTOP_KEY_ID=$apple_key_id" \
  --set \
  "APPLE_DESKTOP_PRIVATE_KEY=$(cat "$apple_key_path")" \
  --set \
  "APPLE_DESKTOP_REDIRECT_URI=$apple_callback"

echo "Desktop social-auth variables were saved to Railway."
echo "Google callback: $google_callback"
echo "Apple callback:  $apple_callback"
