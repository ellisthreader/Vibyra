(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  const allowed = await invoke('take_screenshot_editor_capture');
  const denied = await Promise.all(['remote_security_decide_device', 'write_terminal'].map(async command => {
    try { await invoke(command); return false; } catch (_) { return true; }
  }));
  await fetch(`${window.fixtureOrigin}/result?kind=editor&denied=${allowed && denied.every(Boolean)}`);
})();
