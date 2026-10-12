export function balanceText(units, scale = 1) {
  if (units == null || !/^\d+$/.test(String(units)) || ![1, 10000].includes(scale)) return "—";
  const value = BigInt(units);
  const whole = value / BigInt(scale);
  const fraction = scale === 1 ? "" : String(value % BigInt(scale)).padStart(4, "0").replace(/0+$/, "");
  return whole.toLocaleString("en-GB") + (fraction ? "." + fraction : "");
}

export function validReceipt(payload, pending, ownerId) {
  const receipt = payload?.receipt;
  if (!(payload?.ok === true && receipt?.request_id === pending.request_id
    && String(receipt.actor_id) === String(ownerId)
    && String(receipt.user_id) === String(pending.user_id)
    && [pending.action, "cancelled"].includes(receipt.action)
    && Number.isSafeInteger(receipt.revision) && receipt.revision >= 0
    && typeof receipt.created_at === "string" && Number.isFinite(Date.parse(receipt.created_at)))) return false;
  if (receipt.action === "credit") {
    const scale = receipt.balance === "tokens" ? 10000 : 1;
    return ["tokens", "vibes", "credits"].includes(receipt.balance) && receipt.scale === scale
      && Number.isSafeInteger(receipt.amount) && receipt.amount >= 1 && receipt.amount <= 10000
      && receipt.units === String(receipt.amount * scale);
  }
  if (receipt.action === "warn") return receipt.visibility === "website_account";
  if (receipt.action === "ban") return receipt.status === "banned";
  if (receipt.action === "unban") return receipt.status === "active";
  return receipt.action === "cancelled";
}

export function readPending(storage, key, userId) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const pending = JSON.parse(raw);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(pending?.request_id || "")
    || String(pending.user_id) !== String(userId) || !["credit", "warn", "ban", "unban"].includes(pending.action)) {
    throw new Error("The saved action reference needs recovery before another action can be submitted.");
  }
  return pending;
}

export const actionLabels = { credit: "Credits added", warn: "Warning recorded", ban: "Account banned", unban: "Ban removed", cancelled: "Unconfirmed request cancelled" };
