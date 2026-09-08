#!/usr/bin/env bash
set -euo pipefail
bundle="src-tauri/target/$1/release/bundle"
mount_dir=$(mktemp -d)
install_dir=$(mktemp -d)
app_pid=''
cleanup() {
  if [ -n "$app_pid" ]; then kill "$app_pid" 2>/dev/null || true; fi
  hdiutil detach "$mount_dir" -quiet || true
  rm -rf "$mount_dir" "$install_dir"
}
trap cleanup EXIT
shopt -s nullglob
images=( "$bundle"/dmg/*.dmg )
test "${#images[@]}" = 1
hdiutil verify "${images[0]}"
hdiutil attach "${images[0]}" -mountpoint "$mount_dir" -nobrowse -readonly
apps=( "$mount_dir"/*.app )
test "${#apps[@]}" = 1
ditto "${apps[0]}" "$install_dir/Vibyra.app"
app="$install_dir/Vibyra.app"
codesign --verify --deep --strict --verbose=2 "$app"
if [ "$VIBYRA_MAC_VALIDATION" != true ]; then
  xcrun stapler validate "$app"
  spctl --assess --type execute --verbose=2 "$app"
fi
binary=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
expected=arm64
if [ "$1" = x86_64-apple-darwin ]; then expected=x86_64; fi
lipo "$app/Contents/MacOS/$binary" -verify_arch "$expected"
test "$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$app/Contents/Info.plist")" = '12.0'
"$app/Contents/MacOS/$binary" > "$install_dir/launch.log" 2>&1 &
app_pid=$!
sleep 12
if ! kill -0 "$app_pid"; then cat "$install_dir/launch.log"; exit 1; fi
