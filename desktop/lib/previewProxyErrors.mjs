import { previewCrashPanelHtml } from "./previewUi.mjs";


export function shouldConvertViteModuleError(target, status) {
  return status >= 500 && status <= 599 && isDevSourceModulePath(target?.pathname);
}

function isDevSourceModulePath(pathname) {
  return /^\/(?:@fs\/|src\/|resources\/|app\/|pages\/|components\/)/i.test(String(pathname || ""))
    && /\.(?:jsx?|tsx?|mjs|vue|svelte)(?:[?#]|$)/i.test(String(pathname || ""));
}

export function viteModuleErrorFromHtml(body, target) {
  const html = String(body || "");
  if (!/<html[\s>]/i.test(html) || !/ErrorOverlay|vite:/i.test(html)) return null;
  const error = parseViteErrorObject(html);
  const message = String(error?.message || `Vite failed to load ${target.pathname}`);
  return {
    file: String(error?.id || error?.loc?.file || target.pathname),
    frame: String(error?.frame || ""),
    message,
    plugin: String(error?.plugin || ""),
    stack: String(error?.stack || "")
  };
}

function parseViteErrorObject(html) {
  const marker = "const error = ";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf("\n              try", start);
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(start + marker.length, end).trim());
  } catch {
    return null;
  }
}

export function viteModuleErrorJavaScript(error) {
  const message = error.plugin ? `${error.plugin}: ${error.message}` : error.message;
  const detail = [message, error.file, error.frame, error.stack].filter(Boolean).join("\n\n");
  return [
    "const error = ".concat(JSON.stringify({ ...error, message }), ";"),
    "const detail = ".concat(JSON.stringify(detail), ";"),
    "function send(payload) {",
    "  try {",
    "    const next = Object.assign({ source: 'vibyra-preview-error' }, payload);",
    "    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(next));",
    "    else if (window.parent) window.parent.postMessage(next, '*');",
    "  } catch (_) {}",
    "}",
    "function render() {",
    "  const root = document.body || document.documentElement;",
    "  if (!root || document.getElementById('vibyra-vite-module-error')) return;",
    "  const wrap = document.createElement('main');",
    "  wrap.id = 'vibyra-vite-module-error';",
    "  wrap.style.cssText = 'box-sizing:border-box;min-height:100vh;margin:0;padding:24px;background:#0b0d17;color:#f7f3ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;display:flex;align-items:center;justify-content:center;';",
    "  wrap.innerHTML = ".concat(JSON.stringify(viteErrorOverlayHtml(message, detail)), ";"),
    "  root.appendChild(wrap);",
    "}",
    "send({ type: 'resource', message: 'Vite preview module failed: ' + error.message, file: error.file, stack: detail });",
    "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });",
    "else render();",
    "console.error('Vite preview module failed:', error);",
    "export {};",
    ""
  ].join("\n");
}

function viteErrorOverlayHtml(message, detail) {
  return previewCrashPanelHtml({
    detail,
    eyebrow: "Preview module failed",
    message,
    title: "Preview crashed"
  });
}
