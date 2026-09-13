import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLocation, describePlatform, splitAddress } from '../src/ui/hostIdentity';

test('every computer gets the logo of what it actually runs', () => {
  // The Host sends std::env::consts::OS, so lowercase is the real wire value.
  assert.deepEqual(describePlatform('macos'), { icon: 'logo-apple', label: 'macOS' });
  assert.deepEqual(describePlatform('windows'), { icon: 'logo-windows', label: 'Windows' });
  assert.deepEqual(describePlatform('linux'), { icon: 'logo-tux', label: 'Linux' });
  // Display casing from a saved pairing or the sample workspace, and the
  // arch-suffixed form the desktop reports, must land on the same logos.
  assert.equal(describePlatform('macOS').icon, 'logo-apple');
  // Whatever the computer added about itself survives the relabelling: only the
  // bare wire value is rewritten, never detail someone might be relying on.
  assert.deepEqual(describePlatform('linux · x86_64'), { icon: 'logo-tux', label: 'Linux · x86_64' });
  assert.deepEqual(describePlatform('macOS · Example computer'),
    { icon: 'logo-apple', label: 'macOS · Example computer' });
  assert.deepEqual(describePlatform('Windows 11'), { icon: 'logo-windows', label: 'Windows 11' });
  // A pairing restored before host.state arrives says only "Computer": show a
  // generic machine rather than guessing an operating system.
  assert.deepEqual(describePlatform('Computer'), { icon: 'desktop-outline', label: 'Computer' });
  assert.deepEqual(describePlatform(undefined), { icon: 'desktop-outline', label: 'Computer' });
  assert.deepEqual(describePlatform('  '), { icon: 'desktop-outline', label: 'Computer' });
  // Something unrecognised keeps its own name instead of being relabelled.
  assert.deepEqual(describePlatform('FreeBSD'), { icon: 'desktop-outline', label: 'FreeBSD' });
});

test('the address splits into an IP and a port, IPv6 included', () => {
  assert.deepEqual(splitAddress('192.168.1.24:4318'), { host: '192.168.1.24', port: '4318' });
  assert.deepEqual(splitAddress('[fd00::1]:4318'), { host: '[fd00::1]', port: '4318' });
  // A bracketed address with no port must not lose half of itself to the last colon.
  assert.deepEqual(splitAddress('[fd00::1]'), { host: '[fd00::1]' });
  assert.deepEqual(splitAddress('studio.local'), { host: 'studio.local' });
});

test('location says which network answers and never guesses a place', () => {
  assert.equal(describeLocation('192.168.1.24:4318'), 'Local network');
  assert.equal(describeLocation('10.0.0.8:4318'), 'Local network');
  assert.equal(describeLocation('172.20.5.9:4318'), 'Local network');
  assert.equal(describeLocation('[fd00::1]:4318'), 'Local network');
  assert.equal(describeLocation('studio.local:4318'), 'Local network');
  // 172.32 is public, not private: the /12 boundary must hold.
  assert.equal(describeLocation('172.32.0.1:4318'), 'Outside your network');
  assert.equal(describeLocation('127.0.0.1:4318'), 'This device');
  assert.equal(describeLocation('[::1]:4318'), 'This device');
  assert.equal(describeLocation('169.254.3.7:4318'), 'Direct link');
  assert.equal(describeLocation('[fe80::1]:4318'), 'Direct link');
  assert.equal(describeLocation('203.0.113.7:4318'), 'Outside your network');
});
