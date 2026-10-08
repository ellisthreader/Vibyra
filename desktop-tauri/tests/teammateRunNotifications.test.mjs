import assert from "node:assert/strict";
import test from "node:test";

import { newTeammateAlerts, settledTeammateKeys, teammateRunNotification } from "../src/lib/teammateRunNotifications.ts";
import { enqueue } from "../src/state/notificationQueue.ts";

const item = (id, kind, extra = {}) => ({
  id, title: "Your teammate needs approval", createdAt: "2026-09-30T12:00:00Z", read: false, actionable: true,
  destination: { source: "agent_run", runId: `run-${id}`, agentId: "agent-1", conversationId: "chat-1", kind },
  ...extra,
});
const context = (extra = {}) => ({ seen: new Set(), baseline: false, watching: null, ...extra });

test("the four hooks map onto the existing agent categories and open the exact teammate", () => {
  assert.equal(teammateRunNotification(item("a", "completed")).category, "agentDone");
  assert.equal(teammateRunNotification(item("a", "approval")).category, "agentAttention");
  assert.equal(teammateRunNotification(item("a", "signin")).category, "agentAttention");
  assert.equal(teammateRunNotification(item("a", "failed")).category, "agentFailed");
  assert.deepEqual(teammateRunNotification(item("a", "approval"), "owner@example.com").action, { id: "openTeammate", label: "Open conversation", arg: "agent-1", runId: "run-a", account: "owner@example.com" });
  assert.equal(teammateRunNotification(item("a", "approval")).timeoutMs, 0);
  assert.equal(teammateRunNotification({ ...item("a", "approval"), destination: { source: "cloud_turn", runId: "r" } }), null);
});

test("the first poll remembers, later polls announce each item once", () => {
  const ctx = context({ baseline: true });
  assert.deepEqual(newTeammateAlerts([item("old", "completed")], ctx), []);
  ctx.baseline = false;
  const fresh = [item("new", "approval"), item("old", "completed")];
  assert.equal(newTeammateAlerts(fresh, ctx).length, 1);
  assert.equal(newTeammateAlerts(fresh, ctx).length, 0);
});

test("no double notification while that teammate's thread is on screen", () => {
  assert.deepEqual(newTeammateAlerts([item("a", "approval")], context({ watching: "agent-1" })), []);
  assert.equal(newTeammateAlerts([item("a", "approval")], context({ watching: "agent-2" })).length, 1);
});

test("stale, read or foreign items never raise", () => {
  const ctx = context();
  const items = [item("x", "approval", { actionable: false }), item("y", "failed", { read: true }),
    { ...item("z", "approval"), destination: { source: "host_conversation", runId: "r" } }];
  assert.deepEqual(newTeammateAlerts(items, ctx), []);
});

test("simultaneous task alerts retain both exact destinations", () => {
  const first = enqueue({ history: [], visible: [] }, teammateRunNotification(item("first", "approval")), 1, 1000);
  const second = enqueue(first, teammateRunNotification(item("second", "approval")), 2, 1001);
  assert.equal(second.history.length, 2);
  assert.deepEqual(second.history.map(row => row.action.runId), ["run-second", "run-first"]);
  assert.equal(second.isRepeat, false);
});

test("settled or acknowledged prompts retire without retiring a new pending approval", () => {
  assert.deepEqual([...settledTeammateKeys([item("old", "approval", { actionable: false }),
    item("read", "signin", { read: true }), item("new", "approval")])],
    ["teammate:run-old:approval:old", "teammate:run-read:signin:read"]);
});

test('quiet-hour deferral waits for eligibility; mode suppression never replays',()=>{
 const ctx=context();const deferred=item('quiet','completed',{alertDisposition:'deferred'}), suppressed=item('muted','completed',{alertDisposition:'suppressed'});
 assert.deepEqual(newTeammateAlerts([deferred,suppressed],ctx),[]);assert.equal(ctx.seen.has('quiet'),false);assert.equal(ctx.seen.has('muted'),true);
 assert.equal(newTeammateAlerts([{...deferred,alertDisposition:'eligible'},{...suppressed,alertDisposition:'eligible'}],ctx).length,1);
 assert.equal(newTeammateAlerts([{...deferred,alertDisposition:'eligible'}],ctx).length,0);
 const baseline=context({baseline:true});newTeammateAlerts([deferred],baseline);baseline.baseline=false;assert.equal(newTeammateAlerts([{...deferred,alertDisposition:'eligible'}],baseline).length,0);
});
test('daily summaries keep a distinct owner-bound destination and honour deferral',()=>{
 const id='550e8400-e29b-41d4-a716-446655440000';const digest={...item('digest','completed'),destination:{source:'agent_digest',digestId:id}};
 const action=teammateRunNotification(digest,'owner').action;assert.deepEqual(action,{id:'openAgentDigest',label:'Open daily summary',arg:id,account:'owner'});
 assert.equal(teammateRunNotification({...digest,destination:{source:'agent_digest',digestId:'../../'}}),null);
 const ctx=context();assert.equal(newTeammateAlerts([{...digest,alertDisposition:'deferred'}],ctx).length,0);assert.equal(newTeammateAlerts([digest],ctx).length,1);
 assert.ok(settledTeammateKeys([{...digest,read:true}]).has(`teammate-digest:${id}:digest`));
});
