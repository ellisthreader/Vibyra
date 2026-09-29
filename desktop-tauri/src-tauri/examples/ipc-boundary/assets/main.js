/* Test actual Tauri IPC with inert handlers; no Vibyra account/host initialization. */
const invoke = window.__TAURI_INTERNALS__.invoke;
const sandbox = 'allow-scripts allow-forms allow-modals allow-popups allow-same-origin allow-downloads';
(async () => {
  const rootAllowed = await invoke('remote_security_snapshot');
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', sandbox);
  frame.src = window.fixtureOrigin + '/attack';
  document.body.appendChild(frame);
  const report = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('frame probe timed out')), 15000);
    window.addEventListener('message', event => {
      if (event.origin !== window.fixtureOrigin || event.source !== frame.contentWindow || event.data.type !== 'ipc-probe') return;
      clearTimeout(timer);
      resolve(event.data);
    });
  });
  // Wait for forged native messages to finish, then inspect native mutation count.
  await new Promise(resolve => setTimeout(resolve, 500));
  await invoke('remote_security_disable_all', { report: { ...report, rootAllowed } });
})().catch(error => invoke('remote_security_disable_all', { report: { error: error.message } }));
