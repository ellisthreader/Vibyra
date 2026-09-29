import type { ProviderBrowser } from '../account/browserProvider';

export function passkeyBrowser(): ProviderBrowser {
  // Reserve during the explicit Connect tap, before API/device approval awaits.
  const popup = window.open('about:blank', '_blank', 'popup,width=500,height=700');
  if (!popup) throw new Error('Allow the verification pop-up, then connect again.');
  popup.opener = null;
  return { open: url => { popup.location.href = url; }, closed: () => popup.closed, close: () => popup.close() };
}
