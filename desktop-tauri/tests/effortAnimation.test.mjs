import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeRippleCell, ignitionColumn, ignitionDuration, ignitionHues } from '../src/lib/effortAnimation.ts';

test('Claude picker ripple starts at the selected stop and propagates at 30 cells/second', () => {
  assert.equal(claudeRippleCell(0, 60, 2, 60), 'rgb(140,80,240)');
  assert.equal(claudeRippleCell(0, 59, 2, 60), null);
  assert.equal(claudeRippleCell(640, 40, 2, 60), null);
  assert.notEqual(claudeRippleCell(720, 40, 2, 60), null);
  assert.equal(claudeRippleCell(400, 60, 2, 60), claudeRippleCell(479, 60, 2, 60));
});
test('Codex uses upstream tier colors and finite variant durations', () => {
  assert.deepEqual(ignitionHues('max', false)[0], [255,178,66]);
  assert.deepEqual(ignitionHues('ultra', true)[0], [124,58,217]);
  for (const style of ['wave','aurora','pulse']) for (const tier of ['max','ultra']) {
    const duration = ignitionDuration(style, tier);
    assert.equal(ignitionColumn(style,tier,0,30,60,false), null);
    assert.equal(ignitionColumn(style,tier,duration,30,60,false), null);
    assert([150,250,400].some(ms => Array.from({length:60}, (_,x) => ignitionColumn(style,tier,ms,x,60,false)).some(Boolean)));
  }
  assert.equal(ignitionDuration('wave','max'), 1000);
  assert.equal(ignitionDuration('aurora','ultra'), 1600);
});
