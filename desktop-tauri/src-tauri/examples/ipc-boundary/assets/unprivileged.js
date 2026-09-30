(async () => {
  let denied = false;
  const apiPresent = typeof window.__TAURI_INTERNALS__?.invoke === 'function';
  if (apiPresent) {
    const results = await Promise.all(['remote_security_decide_device', 'take_screenshot_editor_capture'].map(async command => {
      try { await window.__TAURI_INTERNALS__.invoke(command); return false; }
      catch (_) { return true; }
    }));
    denied = results.every(Boolean);
  }
  const kind = location.origin === window.fixtureOrigin ? 'remote' : 'local';
  const origin = kind === 'remote' ? location.origin : window.fixtureOrigin;
  await fetch(`${origin}/result?kind=${kind}&denied=${denied && apiPresent}`);
})();
