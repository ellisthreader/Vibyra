import { previewCrashScreenHtml } from "./previewUi.mjs";
import { PREVIEW_INSPECTOR_RUNTIME_SCRIPT } from "./previewInspectorRuntime.mjs";


const PROXY_RUNTIME_ERROR_SCRIPT = `
(function () {
  if (window.__vibyraPreviewRuntimeErrorOverlay) return;
  window.__vibyraPreviewRuntimeErrorOverlay = true;
  function text(value) {
    return String(value || "").replace(/[&<>"]/g, function (ch) {
      return ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;";
    });
  }
  function detailFrom(event) {
    var error = event && event.error;
    var reason = event && event.reason;
    var message = event && event.message || reason && reason.message || error && error.message || String(reason || "Preview runtime error");
    var stack = error && error.stack || reason && reason.stack || "";
    var file = event && event.filename || "";
    var line = event && event.lineno ? "line " + event.lineno : "";
    return { message: String(message || "Preview runtime error"), stack: String(stack || ""), file: String(file || ""), line: line };
  }
  function report(payload) {
    try {
      var next = { source: payload.source || "vibyra-preview-error", type: payload.type || "error", level: payload.level, message: payload.message, file: payload.file, stack: payload.stack, status: payload.status, timestamp: Date.now() };
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(next));
      else if (window.parent) window.parent.postMessage(next, "*");
    } catch (_) {}
  }
  function consoleText(value) {
    if (value instanceof Error) return value.stack || value.message || String(value);
    if (typeof value === "string") return value;
    if (typeof value === "undefined") return "undefined";
    try {
      var seen = [];
      return JSON.stringify(value, function (_key, next) {
        if (!next || typeof next !== "object") return next;
        if (seen.indexOf(next) !== -1) return "[Circular]";
        seen.push(next);
        return next;
      });
    } catch (_) {
      try { return String(value); } catch (_) { return "[Unserializable value]"; }
    }
  }
  if (window.console && !window.__vibyraPreviewConsoleBridge) {
    window.__vibyraPreviewConsoleBridge = true;
    ["log", "info", "warn", "error", "debug"].forEach(function (level) {
      var original = typeof console[level] === "function" ? console[level].bind(console) : function () {};
      console[level] = function () {
        var args = Array.prototype.slice.call(arguments);
        original.apply(console, args);
        report({
          source: "vibyra-preview-console",
          type: "console",
          level: level,
          message: args.map(consoleText).join(" ").slice(0, 6000)
        });
      };
    });
  }
  window.addEventListener("message", function (event) {
    var payload = event && event.data;
    if (!payload || payload.source !== "vibyra-preview-device") return;
    var dpr = Number(payload.dpr);
    if (!Number.isFinite(dpr) || dpr <= 0 || dpr > 8) return;
    try {
      Object.defineProperty(window, "devicePixelRatio", { configurable: true, get: function () { return dpr; } });
      window.dispatchEvent(new Event("resize"));
    } catch (_) {}
  });
  function previewBasePath() {
    var match = String(location.pathname || "").match(/^(\\/preview\\/server\\/[^\\/]+\\/[^\\/]+\\/?)/);
    if (!match) return "";
    return match[1].charAt(match[1].length - 1) === "/" ? match[1] : match[1] + "/";
  }
  function previewRequestUrl(value) {
    var raw = String(value || "");
    var base = previewBasePath();
    if (!base || !raw || /^(?:data:|blob:|mailto:|tel:|#)/i.test(raw) || raw.indexOf("/preview/") === 0) return value;
    if (raw.charAt(0) === "/") return base + raw.replace(/^\\/+/, "");
    try {
      var parsed = new URL(raw, location.href);
      if (parsed.origin === location.origin && parsed.pathname.indexOf("/preview/") !== 0) {
        return base + parsed.pathname.replace(/^\\/+/, "") + parsed.search + parsed.hash;
      }
    } catch (_) {}
    return value;
  }
  function previewRequestInput(input) {
    if (typeof input === "string") return previewRequestUrl(input);
    try {
      if (typeof Request !== "undefined" && input instanceof Request) {
        var nextUrl = previewRequestUrl(input.url);
        return nextUrl === input.url ? input : new Request(nextUrl, input);
      }
    } catch (_) {}
    return input;
  }
  function render(payload) {
    if (!payload || !payload.message || document.getElementById("vibyra-preview-runtime-error")) return;
    var root = document.body || document.documentElement;
    if (!root) return;
    var wrap = document.createElement("main");
    wrap.id = "vibyra-preview-runtime-error";
    wrap.style.cssText = "box-sizing:border-box;min-height:100vh;margin:0;padding:clamp(16px,5vw,32px);background:radial-gradient(circle at 50% 22%,rgba(80,35,145,.18),transparent 46%),#030511;color:#f7f3ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto;";
    var detail = [payload.file, payload.line, payload.stack].filter(Boolean).join("\\n\\n");
    wrap.innerHTML = '<section style="box-sizing:border-box;width:min(640px,calc(100vw - 40px));min-height:min(430px,calc(100vh - 96px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;justify-content:center;border:1px solid rgba(142,60,255,.52);border-radius:22px;background:rgba(8,10,22,.96);padding:clamp(22px,5vw,36px);box-shadow:0 18px 54px rgba(0,0,0,.34);overflow:hidden"><div style="box-sizing:border-box;width:100%;margin:0 auto"><div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;color:#ff5f76;font-size:13px;font-weight:900;letter-spacing:.01em;text-transform:uppercase"><span aria-hidden="true" style="box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid #ff5f76;border-radius:999px;font-size:18px;line-height:1">!</span><span>PREVIEW RUNTIME ERROR</span></div><h1 style="margin:0 0 20px;font-size:clamp(30px,6vw,42px);line-height:1.05;color:#fff;font-weight:900;letter-spacing:0">Preview crashed</h1><div style="height:1px;background:rgba(255,255,255,.14);margin:0 0 20px"></div><p style="margin:0;color:#d8d2e4;font-size:clamp(15px,3.2vw,18px);font-weight:500;line-height:1.55;word-break:break-word">' + text(payload.message) + '</p><details style="margin-top:24px;color:#f7f3ff"><summary style="box-sizing:border-box;cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;width:100%;min-height:58px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.035);padding:0 16px;font-size:15px;font-weight:900"><span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:rgba(142,60,255,.14);color:#b064ff;font-size:13px;font-weight:900">&lt;/&gt;</span><span style="flex:1">Show technical details</span><span aria-hidden="true" style="color:#d8d2e4;font-size:18px">&#8964;</span></summary><pre style="box-sizing:border-box;max-height:min(28vh,220px);overflow:auto;margin:12px 0 0;white-space:pre-wrap;background:#070911;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;color:#eee8fa;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' + text(detail || payload.message) + '</pre></details></div></section>';
    root.appendChild(wrap);
  }
  function requestFailure(url, status, body) {
    var detail = responseDiagnosticText(body);
    var payload = {
      type: "resource",
      message: "Preview request failed: HTTP " + status,
      file: String(url || ""),
      status: status,
      stack: [String(url || ""), detail].filter(Boolean).join("\\n\\n")
    };
    report(payload);
    render(payload);
  }
  function responseDiagnosticText(body) {
    var raw = String(body || "");
    if (/<[a-z][\\s\\S]*>/i.test(raw) && window.DOMParser) {
      try {
        var doc = new DOMParser().parseFromString(raw, "text/html");
        ["#vibyra-preview-http-error", "#vibyra-preview-runtime-error", "#vibyra-vite-module-error", "script", "style", "noscript"].forEach(function (selector) {
          Array.prototype.forEach.call(doc.querySelectorAll(selector), function (node) { node.remove(); });
        });
        var title = doc.querySelector("title");
        var root = doc.body || doc.documentElement;
        var htmlText = ((title && title.textContent ? title.textContent + "\\n" : "") + (root && root.textContent || ""));
        return htmlText.replace(/\\s+/g, " ").trim().slice(0, 1200);
      } catch (_) {}
    }
    return raw.replace(/\\s+/g, " ").trim().slice(0, 1200);
  }
  if (window.fetch && !window.__vibyraPreviewFetchOverlay) {
    window.__vibyraPreviewFetchOverlay = true;
    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var args = Array.prototype.slice.call(arguments);
      args[0] = previewRequestInput(args[0]);
      var url = typeof args[0] === "string" ? args[0] : args[0] && args[0].url;
      return originalFetch.apply(this, args).then(function (response) {
        if (response && response.status >= 400) {
          try {
            response.clone().text().then(function (body) { requestFailure(url || response.url, response.status, body); }, function () { requestFailure(url || response.url, response.status, ""); });
          } catch (_) {
            requestFailure(url || response.url, response.status, "");
          }
        }
        return response;
      });
    };
  }
  if (window.XMLHttpRequest && !window.__vibyraPreviewXhrOverlay) {
    window.__vibyraPreviewXhrOverlay = true;
    var OriginalXhr = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      var xhr = new OriginalXhr();
      var url = "";
      var originalOpen = xhr.open;
      xhr.open = function (method, nextUrl) {
        var args = Array.prototype.slice.call(arguments);
        args[1] = previewRequestUrl(nextUrl);
        url = args[1];
        return originalOpen.apply(xhr, args);
      };
      xhr.addEventListener("load", function () {
        if (xhr.status >= 400) requestFailure(url || xhr.responseURL, xhr.status, xhr.responseText || "");
      });
      return xhr;
    };
    window.XMLHttpRequest.prototype = OriginalXhr.prototype;
  }
  function handle(event, type) {
    var payload = detailFrom(event);
    payload.type = type;
    report(payload);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { render(payload); }, { once: true });
    else render(payload);
  }
  document.addEventListener("submit", function (event) {
    var form = event && event.target;
    if (!form || !form.getAttribute) return;
    var action = form.getAttribute("action");
    if (action) form.setAttribute("action", previewRequestUrl(action));
  }, true);
  window.addEventListener("error", function (event) { if (!event.target || event.target === window) handle(event, "error"); }, true);
  window.addEventListener("unhandledrejection", function (event) { handle(event, "unhandledrejection"); });
  ${PREVIEW_INSPECTOR_RUNTIME_SCRIPT}
})();
`;


export function injectProxyRuntimeErrorOverlay(html) {
  const source = String(html || "");
  if (source.includes("vibyra-preview-runtime-error")) return source;
  const tag = `<script>${PROXY_RUNTIME_ERROR_SCRIPT}</script>`;
  if (/<head[^>]*>/i.test(source)) return source.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  if (/<html[^>]*>/i.test(source)) return source.replace(/<html([^>]*)>/i, `<html$1><head>${tag}</head>`);
  return `${tag}${source}`;
}

export function injectProxyHttpErrorOverlay(html, { status, target }) {
  const body = String(html || "");
  if (/\bid=["']vibyra-preview-http-error["']/i.test(body)) return body;
  const message = `Preview request failed: HTTP ${status}`;
  const detail = `${target.pathname}${target.search}\n\n${body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200)}`;
  const overlay = previewCrashScreenHtml({
    detail,
    eyebrow: "Preview HTTP error",
    message,
    title: "Preview request failed"
  });
  if (/<body[^>]*>/i.test(body)) return body.replace(/<body([^>]*)>/i, `<body$1>${overlay}`);
  return `${overlay}${body}`;
}
