import { devicePublicKey, answerChallenge } from '../../../host/generated/noise/vibyra_transport.js';

/** The native parent holds the Keychain value; this private runtime performs
 * established sealed-box operations without sending private keys to the API. */
export function runtimeProof(message: { privateKey: string; ciphertext?: string; requestId: string }) {
  let privateKey: Uint8Array | undefined;
  let proof: Uint8Array | undefined;
  try {
    if (!/^[a-f0-9]{64}$/.test(message.privateKey)) throw new Error();
    privateKey = Uint8Array.from(message.privateKey.match(/../g)!, part => parseInt(part, 16));
    const publicKey = Array.from(devicePublicKey(privateKey), value => value.toString(16).padStart(2, '0')).join('');
    if (message.ciphertext !== undefined) {
      if (message.ciphertext.length > 112) throw new Error();
      proof = answerChallenge(privateKey, Uint8Array.from(atob(message.ciphertext), value => value.charCodeAt(0)));
    }
    return { type: 'device-proof', requestId: message.requestId, publicKey,
      proof: proof ? btoa(String.fromCharCode(...proof)) : undefined };
  } catch {
    return { type: 'device-proof', requestId: message.requestId, error: 'The device challenge could not be verified.' };
  } finally { privateKey?.fill(0); proof?.fill(0); }
}
