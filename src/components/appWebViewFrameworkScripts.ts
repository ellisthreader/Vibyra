import { THREE_FALLBACK_SCRIPT } from "./appWebViewFrameworkFallbacks";

type FrameworkSpec = {
  call?: string;
  fallbacks: string[];
  globalName: string;
  name: string;
  primary: string;
};

const EXTERNAL_SCRIPT_RE = /<script\b([^>]*)\bsrc\s*=\s*(["'])((?:https?:)?\/\/[^"']+)\2([^>]*)>\s*<\/script>/gi;

export const FRAMEWORK_RUNTIME_SCRIPT = `
  ${THREE_FALLBACK_SCRIPT}
  function vibyraFrameworkOverlay(name, detail) {
    var id = "vibyra-preview-framework-fallback";
    if (document.getElementById(id)) return;
    var host = document.createElement("div");
    host.id = id;
    host.setAttribute("role", "alert");
    host.style.cssText = "position:fixed;left:14px;right:14px;bottom:14px;z-index:2147483647;padding:14px 16px;border:1px solid rgba(255,214,102,.6);border-radius:14px;background:rgba(11,13,23,.94);color:#fff;font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;box-shadow:0 16px 40px rgba(0,0,0,.35)";
    host.innerHTML = '<strong style="display:block;margin-bottom:4px;color:#ffd666">Preview dependency did not load</strong><span>' + name + ' could not be loaded from its CDN fallback URLs. The app code is still open, but this preview cannot run that framework offline.</span>' + (detail ? '<code style="display:block;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d7c4ff">' + detail + '</code>' : "");
    (document.body || document.documentElement).appendChild(host);
  }
  function vibyraMissingFrameworkProxy(name) {
    if (typeof Proxy !== "function") {
      var noop = function () { return noop; };
      return noop;
    }
    var proxy;
    var target = function () { return proxy; };
    proxy = new Proxy(target, {
      apply: function () { return proxy; },
      construct: function () { return proxy; },
      get: function (_target, prop) {
        if (typeof Symbol === "function" && prop === Symbol.toPrimitive) return function () { return "[missing " + name + "]"; };
        if (prop === "toString") return function () { return "[missing " + name + "]"; };
        if (prop === "valueOf") return function () { return 0; };
        return proxy;
      },
      set: function () { return true; }
    });
    return proxy;
  }
  window.__vibyraPreviewFrameworkMissing = function (info) {
    var name = info && info.name ? String(info.name) : "Framework";
    var detail = info && info.url ? String(info.url) : "";
    send({ type: "resource", message: name + " failed to load before the generated app ran" + (detail ? ": " + detail : ""), file: detail });
    vibyraFrameworkOverlay(name, detail);
  };
  window.__vibyraInstallMissingFrameworkStub = function (globalName, name, url) {
    if (!globalName || window[globalName]) return;
    window.__vibyraPreviewFrameworkMissing({ name: name || globalName, url: url || "" });
    try { window[globalName] = vibyraMissingFrameworkProxy(name || globalName); } catch (_) {}
  };
`;

export function normalizeFrameworkScripts(html: string) {
  return html.replace(EXTERNAL_SCRIPT_RE, (match, before, quote, rawSrc, after) => {
    const spec = frameworkSpecForScript(String(rawSrc), `${before}${after}`);
    if (!spec) return match;
    const scriptTag = `<script${before}src=${quote}${escapeAttribute(spec.primary)}${quote}${after}></script>`;
    return `${scriptTag}<script data-vibyra-framework-guard="${escapeAttribute(spec.name)}">${fallbackLoader(spec)}</script>`;
  });
}

function fallbackLoader(spec: FrameworkSpec) {
  const checks = spec.fallbacks
    .map((url) => `if(!window[${jsString(spec.globalName)}])document.write('<script src="${escapeScriptAttribute(url)}" data-vibyra-framework-fallback="${escapeScriptAttribute(spec.name)}"><\\\\/script>');`)
    .join("");
  const lastUrl = spec.fallbacks[spec.fallbacks.length - 1] || spec.primary;
  const fallbackCall = spec.call || `window.__vibyraInstallMissingFrameworkStub(${jsString(spec.globalName)},${jsString(spec.name)},${jsString(lastUrl)})`;
  return `(function(){${checks}if(!window[${jsString(spec.globalName)}]){${fallbackCall};}})();`;
}

function frameworkSpecForScript(rawSrc: string, attrs: string): FrameworkSpec | null {
  if (/\btype\s*=\s*["']module["']/i.test(attrs)) return null;
  const src = rawSrc.startsWith("//") ? `https:${rawSrc}` : rawSrc;
  const three = threeVersion(src);
  if (three) {
    return framework("Three.js", "THREE", src, [
      `https://cdn.jsdelivr.net/npm/three@${three}/build/three.min.js`,
      `https://unpkg.com/three@${three}/build/three.min.js`
    ], "window.__vibyraInstallThreeFallback&&window.__vibyraInstallThreeFallback()");
  }
  const phaser = packageVersion(src, /(?:cdnjs\.cloudflare\.com\/ajax\/libs\/phaser\/|cdn\.jsdelivr\.net\/npm\/phaser@|unpkg\.com\/phaser@)([^/]+)/i);
  if (phaser) return framework("Phaser", "Phaser", src, [
    `https://cdn.jsdelivr.net/npm/phaser@${phaser}/dist/phaser.min.js`,
    `https://unpkg.com/phaser@${phaser}/dist/phaser.min.js`
  ]);
  const react = packageVersion(src, /(?:cdnjs\.cloudflare\.com\/ajax\/libs\/react\/|cdn\.jsdelivr\.net\/npm\/react@|unpkg\.com\/react@)([^/]+)/i);
  if (react && /\/(?:umd\/)?react(?:\.production)?\.min\.js/i.test(src)) return framework("React", "React", src, [
    `https://cdn.jsdelivr.net/npm/react@${react}/umd/react.production.min.js`,
    `https://unpkg.com/react@${react}/umd/react.production.min.js`
  ]);
  const reactDom = packageVersion(src, /(?:cdnjs\.cloudflare\.com\/ajax\/libs\/react-dom\/|cdn\.jsdelivr\.net\/npm\/react-dom@|unpkg\.com\/react-dom@)([^/]+)/i);
  if (reactDom) return framework("ReactDOM", "ReactDOM", src, [
    `https://cdn.jsdelivr.net/npm/react-dom@${reactDom}/umd/react-dom.production.min.js`,
    `https://unpkg.com/react-dom@${reactDom}/umd/react-dom.production.min.js`
  ]);
  return null;
}

function framework(name: string, globalName: string, src: string, urls: string[], call?: string): FrameworkSpec {
  const unique = Array.from(new Set(urls.concat(src)));
  return { call, fallbacks: unique.filter((url) => url !== unique[0]), globalName, name, primary: unique[0] };
}

function packageVersion(src: string, pattern: RegExp) {
  const version = src.match(pattern)?.[1];
  return version && /^[\w.-]+$/.test(version) ? version : null;
}

function threeVersion(src: string) {
  const release = src.match(/three\.js\/r(\d+)\//i)?.[1];
  if (release) return `0.${release}.0`;
  return packageVersion(src, /(?:three@|three\.js\/)(\d+\.\d+\.\d+)/i);
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeScriptAttribute(value: string) {
  return escapeAttribute(value).replace(/\\/g, "\\\\");
}

function jsString(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
