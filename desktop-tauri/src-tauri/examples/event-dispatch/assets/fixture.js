const api = window.__TAURI_INTERNALS__;
let delivered = false;
const handler = api.transformCallback(() => { delivered = true; });
(async () => {
  await api.invoke('plugin:event|listen', { event: 'fixture:dispatch', target: { kind: 'Any' }, handler });
  const nonblocking = [];
  for (const phase of ['emit', 'eval', 'callback']) {
    nonblocking.push(await api.invoke('remote_security_snapshot', { phase }));
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  await api.invoke('remote_security_disable_all', {
    nonblocking, delivered: delivered && window.fixtureEvalDelivered === true,
  });
})();
