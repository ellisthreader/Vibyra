import * as Network from 'expo-network';

/** This phone's own address, which is what makes the search cover the network
 *  it is actually on rather than only the machine serving the app. On an iOS
 *  Simulator that is the Mac's own address, so the Host is found there too. */
export async function deviceAddress(): Promise<string | undefined> {
  try {
    const address = await Network.getIpAddressAsync();
    // The native side answers "0.0.0.0" when no en* interface has an IPv4 —
    // Wi-Fi off, VPN-only, or a phone on cellular. That is a sentinel, not an
    // address, and it must not travel any further as though it were one.
    if (typeof address !== 'string' || !address || address === '0.0.0.0') return undefined;
    return address;
  } catch {
    // No permission, no network, or no implementation: the other sources stand.
    return undefined;
  }
}
