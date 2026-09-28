/** Decode exact server units; never turn an invalid response into a zero balance. */
export function decodeWallet(value) {
  const invalid = () => { throw new Error('Your token balance could not be verified. Please refresh.'); };
  if (!value || ![1, 2].includes(value.version)) return invalid();
  const wallet = { ...value };
  for (const key of ['available', 'held', 'total', 'paidAvailable']) {
    if (wallet.version === 2) {
      const raw = wallet[`${key}Units`];
      if (wallet.unitScale !== 10000 || typeof raw !== 'string' || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return invalid();
      wallet[key] = Number(raw) / wallet.unitScale;
    } else if (!Number.isSafeInteger(wallet[key]) || wallet[key] < 0) return invalid();
  }
  if (wallet.version === 2 && (BigInt(wallet.availableUnits) + BigInt(wallet.heldUnits) !== BigInt(wallet.totalUnits)
    || BigInt(wallet.paidAvailableUnits) > BigInt(wallet.availableUnits))) return invalid();
  return wallet;
}
