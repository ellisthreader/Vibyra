function syncTerminalTestDeviceFrame(root, preset, size) {
  const frame = root.querySelector("[data-terminal-test-frame]");
  frame.dataset.deviceKind = preset.kind;
  frame.style.setProperty("--test-width", `${size.width}px`);
  frame.style.setProperty("--test-height", `${size.height}px`);
  frame.style.setProperty("--test-radius", `${preset.radius || 9}px`);
  const sizeOutput = root.querySelector("[data-terminal-test-size]");
  if (sizeOutput) sizeOutput.textContent = `${size.width} × ${size.height} · ${preset.dpr || 1}×`;
  postTerminalTestDevice(root, preset);
}

function postTerminalTestDevice(root, preset = terminalTestActivePreset()) {
  const frame = root.querySelector("[data-terminal-test-frame-content]");
  if (!frame?.contentWindow) return;
  frame.contentWindow.postMessage({
    source: "vibyra-preview-device",
    dpr: Number(preset.dpr) || 1,
    height: terminalTestViewportSize(preset).height,
    width: terminalTestViewportSize(preset).width
  }, "*");
}
