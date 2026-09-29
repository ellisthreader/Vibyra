/* The flow secret is scoped to one device proof and one short-lived ceremony. */
(async () => {
  'use strict';
  const params = new URLSearchParams(location.hash.slice(1));
  const id = params.get('id');
  let secret = params.get('secret');
  history.replaceState(null, '', location.pathname);
  const status = document.getElementById('status');
  const button = document.getElementById('continue');
  const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const call = async (path, extra = {}) => {
    const response = await fetch(`/api/security/passkeys/${path}`, { method: 'POST', credentials: 'omit',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ id, secret, ...extra }) });
    const body = await response.json();
    if (!response.ok || body.ok !== true) throw new Error(body.error || 'Verification could not finish. Start again in Vibyra.');
    return body;
  };
  try {
    if (!id || !secret || !window.PublicKeyCredential || !navigator.credentials) throw new Error('Open verification in a browser that supports passkeys.');
    const flow = await call('options');
    const publicKey = flow.options.publicKey;
    publicKey.challenge = decode(publicKey.challenge);
    if (publicKey.user) publicKey.user.id = decode(publicKey.user.id);
    for (const item of [...(publicKey.allowCredentials || []), ...(publicKey.excludeCredentials || [])]) item.id = decode(item.id);
    status.textContent = `Verify ${flow.deviceName} before connecting to your computer.`;
    button.textContent = flow.purpose === 'register' ? 'Create a passkey' : 'Continue with passkey';
    button.hidden = false;
    button.onclick = async () => {
      button.disabled = true;
      try {
        const credential = flow.purpose === 'register'
          ? await navigator.credentials.create({ publicKey }) : await navigator.credentials.get({ publicKey });
        if (!credential) throw new Error('Verification was cancelled.');
        const response = { clientDataJSON: encode(credential.response.clientDataJSON) };
        for (const key of ['attestationObject', 'authenticatorData', 'signature', 'userHandle']) {
          if (credential.response[key]) response[key] = encode(credential.response[key]);
        }
        if (credential.response.getTransports) response.transports = credential.response.getTransports();
        await call('finish', { credential: { id: credential.id, rawId: encode(credential.rawId), type: credential.type, response } });
        secret = null;
        button.hidden = true;
        status.textContent = 'Verified. Return to Vibyra to connect.';
      } catch (error) {
        status.textContent = error.name === 'NotAllowedError' ? 'Verification was cancelled. You can try again.' : error.message;
        button.disabled = false;
      }
    };
  } catch (error) { secret = null; status.textContent = error.message; }
})();
