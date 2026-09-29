import test from 'node:test';
import assert from 'node:assert/strict';
import { onTourRequest, requestTour, shouldOfferTour, tourSeenKey } from '../src/tour/tourRequests';
import { HOLE_RADIUS, holeFor, placeCard } from '../src/tour/tourLayout';
import { BODY_LIMIT, sceneSteps, tourSteps } from '../src/tour/tourSteps';

const firstRun = { cameThroughWelcome: true, complete: true, signedIn: true, demo: false, seen: false };

test('the walkthrough opens by itself only for someone who has just come through the welcome screens', () => {
  assert.equal(shouldOfferTour(firstRun), true);
  // A returning person who updated the app never saw the welcome in this session.
  assert.equal(shouldOfferTour({ ...firstRun, cameThroughWelcome: false }), false);
  assert.equal(shouldOfferTour({ ...firstRun, seen: true }), false);
  assert.equal(shouldOfferTour({ ...firstRun, demo: true }), false);
  assert.equal(shouldOfferTour({ ...firstRun, signedIn: false }), false);
  assert.equal(shouldOfferTour({ ...firstRun, complete: false }), false);
});

test('having seen the walkthrough is remembered per account, whatever the email case', () => {
  assert.equal(tourSeenKey('Ada@Example.com'), tourSeenKey('ada@example.com'));
  assert.notEqual(tourSeenKey('ada@example.com'), tourSeenKey('grace@example.com'));
});

test('a replay request reaches the listening host, and stops once it has gone', () => {
  let heard = 0;
  const stop = onTourRequest(() => heard++);
  requestTour();
  stop();
  requestTour();
  assert.equal(heard, 1);
});

test('each stop points at a real control with one short sentence', () => {
  const steps = tourSteps({ connected: false, agentsAvailable: true });
  assert.deepEqual(steps.map(step => step.target), ['menu', 'mode', 'start']);
  assert.equal(steps[2].title, 'Bring your computer along');
  assert.equal(tourSteps({ connected: true, agentsAvailable: true })[2].title, 'Jump into a project');
  assert.deepEqual(tourSteps({ connected: false, agentsAvailable: false }).map(step => step.target), ['menu', 'start']);
});

test('every stop, on the home and beyond it, keeps its sentence to two lines so the card never jumps', () => {
  const all = [...tourSteps({ connected: true, agentsAvailable: true }), ...tourSteps({ connected: false, agentsAvailable: true }), ...sceneSteps];
  for (const step of all) {
    assert.ok(step.body.length <= BODY_LIMIT, `${step.title} stays short`);
    assert.ok(step.title.length <= 28, `${step.title} is a short title`);
  }
  assert.deepEqual(sceneSteps.map(step => step.scene), ['terminal', 'funding', 'connect']);
});

const phone = { width: 390, height: 844 };
const insets = { top: 47, bottom: 34 };
const card = { screen: phone, insets, cardWidth: 344, cardHeight: 190 };

test('a lit window is padded, kept on screen, and never smaller than its corners', () => {
  const edge = holeFor({ x: 0, y: 0, width: 44, height: 44 }, phone);
  assert.ok(edge.x >= 2 && edge.y >= 2, 'a control at the very edge is still lit on all four sides');
  const tiny = holeFor({ x: 100, y: 100, width: 4, height: 4 }, phone);
  assert.ok(tiny.width >= HOLE_RADIUS * 2 && tiny.height >= HOLE_RADIUS * 2);
  const wide = holeFor({ x: 20, y: 400, width: 700, height: 100 }, phone);
  assert.ok(wide.x + wide.width <= phone.width - 2, 'a window wider than the screen is held inside it');
});

test('the card sits under a control in the top half, over one in the bottom half, and points at it', () => {
  const menu = placeCard({ ...card, rect: { x: 8, y: 52, width: 44, height: 44 } });
  assert.equal(menu.side, 'top');
  assert.ok(menu.y > 96, 'below the control');
  assert.equal(menu.x, 16, 'held to the screen edge');
  assert.ok(menu.pointerX >= 30 && menu.pointerX <= 344 - 30, 'the pointer stays on the card');
  const start = placeCard({ ...card, rect: { x: 20, y: 560, width: 350, height: 110 } });
  assert.equal(start.side, 'bottom');
  assert.ok(start.y + 190 < 560, 'above the control');
  assert.ok(start.y >= insets.top + 8, 'never under the status bar');
});

test('over a sample screen the card docks at the top with no pointer', () => {
  const docked = placeCard({ ...card, rect: null });
  assert.deepEqual(docked, { x: 23, y: 55, side: null, pointerX: 0 });
});
