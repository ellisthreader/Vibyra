import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLocation, describePlatform, displayAddress, guessPlatform, locationLookup, onThisDevice, platformLogo,
  splitAddress } from '../src/ui/hostIdentity';

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

test('without a place, location says which network answers', () => {
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

test('a place is looked up by the public address the computer answers from', () => {
  // On this phone's network the computer shares the phone's public address, so
  // the phone asks about itself; the private address itself has no geography.
  for (const address of ['192.168.1.24:4318', '10.0.0.8:4318', '[fd00::1]:4318', 'studio.local:4318',
    '127.0.0.1:4318', '[::1]:4318', '169.254.3.7:4318', '[fe80::1]:4318']) {
    assert.equal(locationLookup(address), 'self', address);
  }
  // Reached from outside, the computer's own address is the one to ask about.
  assert.equal(locationLookup('203.0.113.7:4318'), '203.0.113.7');
  assert.equal(locationLookup('[2a00:1450:4009:81f::200e]:4318'), '2a00:1450:4009:81f::200e');
  // A name is not an address, and nothing else may reach the lookup's URL.
  assert.equal(locationLookup('studio.example.com:4318'), null);
  assert.equal(locationLookup('../evil:4318'), null);
});

test('the address on the page is the IP alone', () => {
  // A phone often reaches a computer over IPv6, and on an IPv6-only network that
  // is the only address it has. The brackets are URL syntax and the port is
  // noise; without the brackets a port would even read as another IPv6 group.
  assert.equal(displayAddress('[2a00:23ee:1a2b:3c4d:5e6f:7a8b:9c0d:1e2f]:4318'), '2a00:23ee:1a2b:3c4d:5e6f:7a8b:9c0d:1e2f');
  assert.equal(displayAddress('[fd00::1]'), 'fd00::1');
  assert.equal(displayAddress('192.168.1.24:4318'), '192.168.1.24');
  assert.equal(displayAddress('studio.local:4318'), 'studio.local');
});

test('a loopback address is this very device, and nothing else is', () => {
  // The iOS Simulator reaches Vibyra on the Mac it runs on at ::1.
  for (const address of ['[::1]:4319', '127.0.0.1:4318', 'localhost:4318']) assert.equal(onThisDevice(address), true, address);
  for (const address of ['192.168.1.24:4318', '[2a00:23ee:1a2b:3c4d:5e6f:7a8b:9c0d:1e2f]:4319', '[fe80::1]:4318']) {
    assert.equal(onThisDevice(address), false, address);
  }
});

test('a computer that did not say its family is drawn from its name, or as this Mac', () => {
  // A Host built before the advertisement carried `os` still names itself the way its OS did.
  assert.equal(guessPlatform('Elliss-MacBook-Air'), 'macos');
  assert.equal(guessPlatform('Studio iMac'), 'macos');
  assert.equal(guessPlatform('Mac mini'), 'macos');
  assert.equal(guessPlatform('DESKTOP-4F2K1Q'), 'windows');
  assert.equal(guessPlatform('LAPTOP-9XK2M3P'), 'windows');
  assert.equal(guessPlatform('ubuntu-server'), 'linux');
  assert.equal(guessPlatform('raspberrypi'), 'linux');
  // A name that could be anything gives nothing: a wrong logo is worse than none.
  assert.equal(guessPlatform('Ellis’s Studio'), undefined);
  assert.equal(guessPlatform('Office desktop'), undefined);
  assert.equal(guessPlatform('Workshop'), undefined);
  // Answering at this device's own address, the computer is the Mac the Simulator runs on.
  assert.equal(guessPlatform('Ellis’s Studio', '127.0.0.1'), 'macos');
  assert.equal(guessPlatform('Ellis’s Studio', '[::1]'), 'macos');
  assert.equal(guessPlatform('Ellis’s Studio', '192.168.1.24'), undefined);
  // The Host's own word always wins over a guess, and only a known family gets a logo.
  assert.equal(platformLogo('windows'), 'logo-windows');
  assert.equal(platformLogo(guessPlatform('Elliss-MacBook-Air')), 'logo-apple');
  assert.equal(platformLogo(undefined), undefined);
  assert.equal(platformLogo('FreeBSD'), undefined);
});
