(async () => {
  let denied = false;
  const apiPresent = typeof window.__TAURI_INTERNALS__?.invoke === 'function';
  if (apiPresent) {
    try { await window.__TAURI_INTERNALS__.invoke('remote_security_decide_device'); }
    catch (_) { denied = true; }
  }
  const kind = location.origin === window.fixtureOrigin ? 'remote' : 'local';
  const origin = kind === 'remote' ? location.origin : window.fixtureOrigin;
  await fetch(`${origin}/result?kind=${kind}&denied=${denied && apiPresent}`);
})();
