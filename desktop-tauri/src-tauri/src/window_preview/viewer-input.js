// Taps, scrolls and keys reach the window in the order the phone made them,
// one request at a time. Nothing is dropped: keys typed while a request is on
// its way travel together in the next one, and scrolls add up.
import { joinActions, textUnits } from './viewer-typing.js';

const MAX_ACTIONS = 64, MAX_UNITS = 512;

export function createSender({ onReply, onProblem }) {
  const queue = [];
  // The computer accepts only rising numbers per window session, and a reloaded
  // viewer keeps that session: start from the clock so a reload still rises.
  let sequence = Date.now(), busy = false;

  function fits(first, second) {
    const joined = joinActions(first.actions, second.actions);
    return joined.length <= MAX_ACTIONS && textUnits(joined) <= MAX_UNITS ? joined : null;
  }

  function push(event) {
    // Only requests not yet sent can take more.
    const last = queue.at(-1);
    if (event.kind === 'keys' && !event.actions.length) return;
    if (event.kind === 'keys' && last?.kind === 'keys') {
      const joined = fits(last, event);
      if (joined) { last.actions = joined; return; }
    }
    if (event.kind === 'scroll' && last?.kind === 'scroll' && Math.abs(last.x - event.x) < 0.02 && Math.abs(last.y - event.y) < 0.02) {
      last.delta = Math.max(-600, Math.min(600, last.delta + event.delta));
      return;
    }
    queue.push(event);
    void pump();
  }

  async function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const event = queue.shift();
    try {
      const response = await fetch('/input', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-vibyra-window': '1' },
        body: JSON.stringify({ ...event, sequence: ++sequence }), signal: AbortSignal.timeout(8000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || 'The window did not accept that.');
      onReply(JSON.parse(text || '{}'), event);
    } catch (error) {
      onProblem(error?.name === 'TimeoutError' ? 'Your computer did not answer in time. Try again.' : error?.message || String(error), event);
    } finally {
      busy = false;
      void pump();
    }
  }

  return {
    push,
    /** Keys and taps still to reach the window. */
    get pending() { return queue.length + (busy ? 1 : 0); },
  };
}
