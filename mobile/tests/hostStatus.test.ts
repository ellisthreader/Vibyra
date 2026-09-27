import test from 'node:test';
import assert from 'node:assert/strict';
import { describeConnection } from '../src/ui/hostStatus';

const words = (state: Parameters<typeof describeConnection>[0]) => describeConnection(state);

test('a connection on its way back is said as such, not as an error', () => {
  assert.deepEqual(words({ status: 'connected', error: null }),
    { label: 'Connected', tone: 'success', working: false, figure: 'live', problem: null });
  // The ladder between attempts: the app is acting on the drop, so the error
  // it is acting on is not put in front of the person.
  assert.deepEqual(words({ status: 'offline', reconnecting: true, error: 'Connection closed. Reconnect to catch up.' }),
    { label: 'Reconnecting…', tone: 'accent', working: true, figure: 'waking', problem: null });
  assert.equal(words({ status: 'connecting', error: null }).label, 'Reconnecting…');
  assert.equal(words({ status: 'pairing', error: null }).label, 'Waiting for approval on your computer');
});

test('once the app has stopped trying, what stopped it is shown', () => {
  assert.deepEqual(words({ status: 'error', reconnecting: false, error: 'Cannot reach your computer. Check that Vibyra Host is running.' }),
    { label: 'Couldn’t reach your computer', tone: 'error', working: false, figure: 'asleep',
      problem: 'Cannot reach your computer. Check that Vibyra Host is running.' });
  // Put away by hand: nothing went wrong, so nothing is reported.
  assert.deepEqual(words({ status: 'offline', error: null }),
    { label: 'Not connected', tone: 'muted', working: false, figure: 'asleep', problem: null });
  assert.equal(words({ status: 'connected', error: null, demo: true }).label, 'Sample computer');
});
