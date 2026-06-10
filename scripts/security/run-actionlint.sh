#!/usr/bin/env bash

set -euo pipefail

version="1.7.12"
archive="actionlint_${version}_linux_amd64.tar.gz"
expected_sha256="8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8"
download_url="https://github.com/rhysd/actionlint/releases/download/v${version}/${archive}"
work_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

curl --fail --silent --show-error --location \
  --proto '=https' \
  --tlsv1.2 \
  "$download_url" \
  --output "$work_dir/$archive"

printf '%s  %s\n' "$expected_sha256" "$work_dir/$archive" | sha256sum --check
tar -xzf "$work_dir/$archive" -C "$work_dir"

"$work_dir/actionlint" \
  -no-color \
  -shellcheck '' \
  -pyflakes '' \
  .github/workflows/*.yml
