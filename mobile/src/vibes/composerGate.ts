import type { VibesWallet } from './types';

/**
 * Whether this wallet may chat at all. The server says so outright with
 * `chatEnabled`; where an older one does not, a guest proved its trial at
 * creation and an account by verifying its email. An unverified account the
 * server has nonetheless opened the trial to is not locked out of it here.
 */
export function chatUnlocked(wallet: VibesWallet | null | undefined): boolean {
  if (!wallet || wallet.chatEnabled === false) return false;
  return wallet.chatEnabled === true || wallet.guest === true || wallet.verified === true;
}

/** An account whose address is still unconfirmed: a notice, blocking only while the trial is closed to it. */
export function unverifiedNotice(wallet: VibesWallet | null | undefined): string | null {
  if (!wallet || wallet.guest || wallet.verified) return null;
  return chatUnlocked(wallet)
    ? 'Verify your email to use purchased Vibes. Refresh once you have.'
    : 'Verify your email, then refresh to unlock your trial.';
}

export interface SendGate {
  active: boolean;
  readOnly: boolean;
  ready: boolean;
  wallet: VibesWallet | null;
  text: string;
  uploading: boolean;
  failed: boolean;
  blind: string | null;
  referenceIssue: string | null;
  project: string | null;
  quoted: boolean;
  canAfford: boolean;
}

/**
 * Why Send would do nothing right now, in one line, or null when it would send.
 * Said under the box when the greyed arrow is tapped: a tap that does nothing
 * and explains nothing reads as a broken button.
 */
export function sendBlockReason(gate: SendGate): string | null {
  if (readOnlyReason(gate)) return readOnlyReason(gate);
  if (!gate.wallet || !gate.ready)
    return 'Still loading your account. Tap Refresh if this takes a while.';
  if (gate.wallet.chatEnabled === false)
    return 'AI chats are being prepared. Your balance and history are safe.';
  if (!gate.wallet.consented) return 'Allow AI processing above to send your first message.';
  if (!chatUnlocked(gate.wallet)) return 'Verify your email, then tap Refresh account to send.';
  if (gate.blind) return gate.blind;
  if (gate.failed) return 'Remove the attachment that did not upload.';
  if (gate.uploading) return 'Wait for the attachment to finish uploading.';
  if (gate.referenceIssue) return gate.referenceIssue;
  if (gate.project) return `Allow this chat to use ${gate.project} before sending.`;
  if (!gate.text.trim()) return 'Type a message first.';
  if (!gate.quoted) return 'Working out the price. Try again in a moment.';
  if (!gate.canAfford) return 'Not enough Vibes for this reply. Get more to send it.';
  return null;
}
function readOnlyReason(gate: SendGate) {
  if (!gate.active) return 'Open this chat to send to it.';
  return gate.readOnly ? 'This chat only reads right now.' : null;
}
