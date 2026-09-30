import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import plist from '@expo/plist';
import config from '../app.config';

const native = (path: string) =>
  plist.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as Record<string, unknown>;

test('checked-in iOS project agrees with the app config', () => {
  const info = native('../ios/Vibyra/Info.plist');
  const entitlements = native('../ios/Vibyra/Vibyra.entitlements');
  const project = readFileSync(
    new URL('../ios/Vibyra.xcodeproj/project.pbxproj', import.meta.url),
    'utf8',
  );
  const configured = config.ios?.infoPlist ?? {};

  for (const key of [
    'NSLocalNetworkUsageDescription',
    'NSAppTransportSecurity',
    'NSSpeechRecognitionUsageDescription',
    'ITSAppUsesNonExemptEncryption',
    'LSApplicationQueriesSchemes',
  ]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(info[key])),
      configured[key],
      `${key} differs from app.config.ts`,
    );
  }
  assert.ok(
    (info.NSBonjourServices as string[]).includes((configured.NSBonjourServices as string[])[0]),
  );
  assert.equal(info.CFBundleShortVersionString, config.version);
  assert.equal(info.UIUserInterfaceStyle, 'Automatic');
  assert.ok(JSON.stringify(info.CFBundleURLTypes).includes(`"${config.scheme}"`));
  assert.ok(project.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${config.ios?.bundleIdentifier};`));
  assert.ok(project.includes(`DEVELOPMENT_TEAM = ${config.ios?.appleTeamId};`));
  assert.deepEqual(entitlements['com.apple.developer.applesignin'], ['Default']);
  assert.ok(entitlements['aps-environment']);
});
