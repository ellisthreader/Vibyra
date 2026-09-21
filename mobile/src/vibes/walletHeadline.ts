import type { VibesWallet } from './types';

/** The figure the balance page leads with, its unit, and the two as one spoken line. */
export interface WalletHeadline { figure: number; unit: string; label: string }

/**
 * What to lead with: the Vibes you can spend. That is `available`, except for a
 * wallet that holds nothing while its whole trial is still ahead of it. The trial
 * is funded as a chat starts, so such a page read "0 Vibes available" over meters
 * saying "60 of 60" — two figures for one account that disagreed with each other.
 * The trial allowance the backend publishes is then the number to lead with, and
 * its unit says so ("Vibes to try"), because it is an offer rather than a balance.
 *
 * The trial counts as untouched only while every trial chat is still unused; a
 * chat that has drawn on it leaves `available` as the one truthful figure, and a
 * backend that publishes no trial figures never has one invented for it.
 */
export function walletHeadline(wallet: VibesWallet): WalletHeadline {
  const { trialCredits, trialChats } = wallet;
  const untouched = wallet.available === 0 && wallet.held === 0 && wallet.paidAvailable === 0
    && trialCredits !== null && trialCredits > 0 && trialChats !== null && trialChats > 0
    && wallet.trialChatsRemaining >= trialChats;
  const figure = untouched ? trialCredits : wallet.available;
  const unit = untouched ? 'Vibes to try' : 'Vibes available';
  return { figure, unit, label: `${figure.toLocaleString()} ${unit}` };
}
