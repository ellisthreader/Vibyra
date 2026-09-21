import type { PurchaseBridge, VibesApi, VibesWallet } from './types';

export async function claimPending(api: VibesApi, bridge: PurchaseBridge, restore: boolean): Promise<VibesWallet> {
  const wallet = await api.wallet();
  const transactions = restore ? await bridge.restore() : await bridge.pending();
  for (const t of transactions) {
    if (t.accountToken && t.accountToken.toLowerCase() !== wallet.accountToken.toLowerCase()) continue;
    await api.purchase(t.transactionId, t.productId);
    await bridge.finish(t.transactionId).catch(() => {});
  }
  return api.wallet();
}
export async function buyVibes(api: VibesApi, bridge: PurchaseBridge, productId: string, wallet: VibesWallet): Promise<VibesWallet | null> {
  if (!wallet.purchasesEnabled || !wallet.products.some(p => p.id === productId)) throw new Error('This purchase is not available yet.');
  const transaction = await bridge.buy(productId, wallet.accountToken);
  if (!transaction) return null;
  if (transaction.productId !== productId) throw new Error('Apple returned a different product. Use Restore Purchases to check your balance.');
  if (transaction.accountToken && transaction.accountToken.toLowerCase() !== wallet.accountToken.toLowerCase())
    throw new Error('This purchase belongs to another Vibyra account. Sign in to that account to restore it.');
  const updated = await api.purchase(transaction.transactionId, transaction.productId);
  // The server grant succeeded. An unfinished acknowledgement is retried on recovery.
  await bridge.finish(transaction.transactionId).catch(() => {});
  return updated;
}
