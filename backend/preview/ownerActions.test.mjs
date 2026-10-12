import test from "node:test";
import assert from "node:assert/strict";
import { balanceText, readPending, validReceipt } from "../resources/js/portal/owner/ownerActionProtocol.js";

const pending = { request_id: "aabbccdd-1111-2222-3333-eeeeeeeeeeee", user_id: 42, action: "credit" };
const receipt = { ...pending, actor_id: 7, revision: 1, created_at: "2026-10-12T12:00:00Z",
  amount: 25, balance: "tokens", units: "250000", scale: 10000 };
const payload = value => ({ ok: true, receipt: value });

test("receipt validation requires actor, target, exact units and a valid durable revision", () => {
  assert.equal(validReceipt(payload(receipt), pending, 7), true);
  for (const bad of [{ actor_id: 8 }, { user_id: 43 }, { request_id: "other" }, { revision: -1 },
    { revision: 0.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { created_at: "" }, { amount: undefined },
    { balance: "credits" }, { units: "25" }, { scale: 1 }, { amount: 0 }, { action: "warn" }]) {
    assert.equal(validReceipt(payload({ ...receipt, ...bad }), pending, 7), false, JSON.stringify(bad));
  }
  assert.equal(validReceipt({ receipt }, pending, 7), false);
});

test("recovered cancellation and moderation receipts require their explicit result", () => {
  const base = { ...receipt, action: "cancelled", revision: 0 };
  assert.equal(validReceipt(payload(base), pending, 7), true);
  for (const [action, details] of [["warn", { visibility: "website_account" }], ["ban", { status: "banned" }], ["unban", { status: "active" }]]) {
    assert.equal(validReceipt(payload({ ...base, action }), { ...pending, action }, 7), false);
    assert.equal(validReceipt(payload({ ...base, action, ...details }), { ...pending, action }, 7), true);
  }
});

test("pending recovery is target-scoped and never treats damaged or inaccessible storage as an empty queue", () => {
  assert.deepEqual(readPending({ getItem: () => JSON.stringify(pending) }, "key", 42), pending);
  assert.equal(readPending({ getItem: () => null }, "key", 42), null);
  for (const bad of ["{", JSON.stringify({ ...pending, user_id: 1 }), JSON.stringify({ ...pending, request_id: "bad" })]) {
    assert.throws(() => readPending({ getItem: () => bad }, "key", 42));
  }
  assert.throws(() => readPending({ getItem: () => { throw new Error("Storage unavailable"); } }, "key", 42));
});

test("wallet amounts preserve every stored fraction and large integer", () => {
  assert.equal(balanceText("1205500", 10000), "120.55");
  assert.equal(balanceText("1", 10000), "0.0001");
  assert.equal(balanceText("90071992547409930001", 10000), "9,007,199,254,740,993.0001");
  assert.equal(balanceText("-1", 1), "—");
});
