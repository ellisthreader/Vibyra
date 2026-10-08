import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const out = '/private/tmp/Vibyra Notification Proof.app';
await mkdir(`${out}/Contents/MacOS`, { recursive: true });
await writeFile(`${out}/Contents/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>app.vibyra.notification-proof</string>
<key>CFBundleName</key><string>Vibyra Notification Proof</string><key>CFBundleExecutable</key><string>notification-proof</string>
<key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string><key>LSMinimumSystemVersion</key><string>11.0</string>
</dict></plist>`);
execFileSync('xcrun', ['swiftc', '-parse-as-library', '-O', '-framework', 'AppKit', '-framework', 'UserNotifications',
  resolve('src-tauri/native/notifications/Notifications.swift'), resolve('tests/nativeNotificationProof.swift'),
  '-o', `${out}/Contents/MacOS/notification-proof`], { stdio: 'inherit' });
execFileSync('codesign', ['--force', '--sign', '-', out], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', out], { stdio: 'inherit' });
console.log(`READY ${out}\nIsolated bundle: app.vibyra.notification-proof\nProof receipts: /private/tmp/vibyra-notification-proof.json`);
