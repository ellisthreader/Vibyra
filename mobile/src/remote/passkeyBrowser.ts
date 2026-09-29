import * as Browser from 'expo-web-browser';
import type { ProviderBrowser } from '../account/browserProvider';

export function passkeyBrowser(): ProviderBrowser {
  let closed = false, opened = false;
  return {
    open(url) {
      opened = true;
      void Browser.openAuthSessionAsync(url, 'vibyra://remote-verified').then(() => { closed = true; }, () => { closed = true; });
    },
    closed: () => closed,
    close() { if (opened && !closed) Browser.dismissAuthSession(); closed = true; },
  };
}
