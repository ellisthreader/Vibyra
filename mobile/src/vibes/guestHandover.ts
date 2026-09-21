import { vibesStateKey } from './guestKeys';

type Flags = { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; delete(key: string): Promise<void> };

/**
 * What the guest's phone chat kept on this phone — the chat it had open, a turn
 * still pending, its model and effort — once a sign-in has decided whose it is.
 *
 * Signing up converts the guest into the account, so the account inherits it
 * and opens on the same chat. Logging in leaves the guest behind, so it is
 * dropped: left in place it was picked up by the next guest this phone made
 * after Log out, which then asked the server for a chat that was never its own.
 * Trust in a computer is not touched; that belongs to the phone, not to anyone
 * signed in on it.
 */
export async function handOverGuestState(flags: Flags, email: string, converted: boolean) {
  const guest = vibesStateKey(null);
  const saved = await flags.read(guest);
  if (converted && saved && !(await flags.read(vibesStateKey(email)))) await flags.write(vibesStateKey(email), saved);
  await flags.delete(guest);
}
