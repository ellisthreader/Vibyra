import { PHASER_PATCH_SCRIPT } from "./appWebViewPhaserPatch";
import { replaceMissingAssets } from "./appWebViewHtmlAssets";

export type PreviewRuntimeError = { column?: number; line?: number; message: string; source?: string; stack?: string; type: "console" | "error" | "resource" | "unhandledrejection" | "webview" };

const RELATIVE_SCRIPT_RE = /<script\b([^>]*)\bsrc\s*=\s*("|')(?!https?:|data:|blob:|\/\/|about:)([^"']*?)\2([^>]*)>\s*<\/script>/gi;
const RELATIVE_LINK_RE = /<link\b([^>]*?)\bhref\s*=\s*("|')(?!https?:|data:|\/\/|about:)([^"']*?)\2([^>]*)>/gi;
const BASE_TAG = '<base href="about:srcdoc">';

export const ERROR_CAPTURE_SCRIPT = `
(function () {
  if (window.__vibyraPreviewErrorCapture) return true;
  window.__vibyraPreviewErrorCapture = true;
  function send(payload) {
    try {
      var next = Object.assign({ source: "vibyra-preview-error" }, payload);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(next));
      else if (window.parent) window.parent.postMessage(next, "*");
    } catch (_) {}
  }
  function formatArg(item) {
    if (item instanceof Error) return item.stack || item.message;
    if (item && item.stack) return item.stack;
    if (typeof item === "string") return item;
    try {
      var json = JSON.stringify(item);
      return json === undefined ? String(item) : json;
    } catch (_) {
      return String(item);
    }
  }
  function isRelevant(message) {
    return !/The above error occurred in the <.*?> component:|Consider adding an error boundary|Download the React DevTools/i.test(message);
  }
  function resourceUrl(target) {
    return target && (target.currentSrc || target.src || target.href || target.data || target.poster);
  }
  function reportResource(kind, url, detail) {
    if (!url || /^(?:data|blob):/i.test(String(url))) return;
    send({ type: "resource", message: "Failed to load " + kind + ": " + url + (detail ? " (" + detail + ")" : ""), file: String(url) });
  }
  function previewFallbackUrl(key) {
    try {
      var label = String(key || "image").slice(0, 24).replace(/[<>&]/g, "");
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="30" fill="#21163a"/><path d="M34 128 78 76l26 32 20-22 34 42z" fill="#8e3cff"/><circle cx="132" cy="54" r="18" fill="#d7c4ff"/><text x="96" y="166" fill="#efe8ff" font-family="Arial" font-size="18" font-weight="700" text-anchor="middle">' + label + '</text></svg>';
      return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    } catch (_) { return ""; }
  }
  function applyImageFallback(target, key) {
    if (!target || target.__vibyraFallbackSet || !/^(?:img|image)$/i.test(String(target.tagName || ""))) return;
    var fallback = previewFallbackUrl(key);
    if (fallback) {
      target.__vibyraFallbackSet = true;
      target.src = fallback;
    }
  }
  function resourceDetails(target) {
    if (!target || target === window || !target.tagName) return null;
    var tag = String(target.tagName).toLowerCase();
    var url = resourceUrl(target);
    if (!url || /^(?:data|blob):/i.test(String(url))) return null;
    var rel = target.rel ? String(target.rel).toLowerCase() : "";
    var kind = tag === "img" ? "image" : tag === "script" ? "script" : tag === "link" ? (rel.indexOf("stylesheet") >= 0 ? "stylesheet" : "link") : tag;
    return { kind: kind || "resource", url: String(url) };
  }
  function watchResourceElement(target, kind) {
    if (!target || target.__vibyraResourceWatched) return target;
    target.__vibyraResourceWatched = true;
    target.addEventListener("error", function () {
      var url = resourceUrl(target);
      reportResource(kind, url);
      applyImageFallback(target, url || kind);
    });
    return target;
  }
  if (window.Image && !window.__vibyraImageCapture) {
    window.__vibyraImageCapture = true;
    var OriginalImage = window.Image;
    window.Image = function (width, height) {
      var image = arguments.length > 0 ? new OriginalImage(width, height) : new OriginalImage();
      return watchResourceElement(image, "image");
    };
    window.Image.prototype = OriginalImage.prototype;
  }
  if (document.createElement && !window.__vibyraCreateElementCapture) {
    window.__vibyraCreateElementCapture = true;
    var originalCreateElement = document.createElement.bind(document);
    document.createElement = function (name) {
      var element = originalCreateElement.apply(document, arguments);
      var tag = String(name || "").toLowerCase();
      var kind = tag === "img" || tag === "image" ? "image" : tag;
      return /^(?:img|image|audio|video|source|track)$/i.test(tag) ? watchResourceElement(element, kind) : element;
    };
  }
  if (window.fetch && !window.__vibyraFetchCapture) {
    window.__vibyraFetchCapture = true;
    var originalFetch = window.fetch;
    window.fetch = function (input) {
      var url = typeof input === "string" ? input : input && input.url;
      return originalFetch.apply(this, arguments).then(function (response) {
        if (response && response.ok === false) reportResource("request", url || response.url, "HTTP " + response.status);
        return response;
      }, function (error) {
        reportResource("request", url, error && error.message ? error.message : "network error");
        throw error;
      });
    };
  }
  if (window.XMLHttpRequest && !window.__vibyraXhrCapture) {
    window.__vibyraXhrCapture = true;
    var OriginalXhr = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      var xhr = new OriginalXhr();
      var url = "";
      var originalOpen = xhr.open;
      xhr.open = function (method, nextUrl) {
        url = nextUrl;
        return originalOpen.apply(xhr, arguments);
      };
      xhr.addEventListener("load", function () {
        if (xhr.status >= 400) reportResource("request", url || xhr.responseURL, "HTTP " + xhr.status);
      });
      xhr.addEventListener("error", function () {
        reportResource("request", url || xhr.responseURL, "network error");
      });
      return xhr;
    };
    window.XMLHttpRequest.prototype = OriginalXhr.prototype;
  }
  window.addEventListener("error", function (event) {
    var resource = resourceDetails(event.target);
    if (resource) {
      reportResource(resource.kind, resource.url);
      applyImageFallback(event.target, resource.url);
      return;
    }
    send({ type: "error", message: event.message || "Uncaught preview error", file: event.filename, line: event.lineno, column: event.colno, stack: event.error && event.error.stack });
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason || {};
    send({ type: "unhandledrejection", message: reason.message || formatArg(event.reason || "Unhandled promise rejection"), stack: reason.stack });
  });
  var originalError = console.error;
  console.error = function () {
    var message = Array.prototype.map.call(arguments, formatArg).join(" ");
    if (isRelevant(message)) send({ type: "console", message: message });
    return originalError.apply(console, arguments);
  };
  var originalWarn = console.warn;
  console.warn = function () {
    var message = Array.prototype.map.call(arguments, formatArg).join(" ");
    if (isRelevant(message)) send({ type: "console", message: message });
    return originalWarn.apply(console, arguments);
  };
  ${PHASER_PATCH_SCRIPT}
  true;
})();
`;

const ERROR_CAPTURE_SCRIPT_TAG = `<script>${ERROR_CAPTURE_SCRIPT}</script>`;

export function parsePreviewError(data: unknown): PreviewRuntimeError | null {
  if (!data || typeof data !== "object" || (data as { source?: unknown }).source !== "vibyra-preview-error") return null;
  const payload = data as Record<string, unknown>;
  return {
    column: numeric(payload.column),
    line: numeric(payload.line),
    message: String(payload.message || "Preview runtime error"),
    source: payload.file ? String(payload.file) : undefined,
    stack: payload.stack ? String(payload.stack) : undefined,
    type: previewErrorType(payload.type)
  };
}

export function preparePreviewHtml(html: string) { return replaceMissingAssets(html); }

export function prepareSrcDocHtml(html: string): string {
  let next = replaceMissingAssets(html).replace(RELATIVE_SCRIPT_RE, "").replace(RELATIVE_LINK_RE, "");
  if (!/<base\b/i.test(next)) {
    if (/<head[^>]*>/i.test(next)) {
      next = next.replace(/<head([^>]*)>/i, `<head$1>${BASE_TAG}${ERROR_CAPTURE_SCRIPT_TAG}`);
    } else if (/<html[^>]*>/i.test(next)) {
      next = next.replace(/<html([^>]*)>/i, `<html$1><head>${BASE_TAG}${ERROR_CAPTURE_SCRIPT_TAG}</head>`);
    } else {
      next = `<!doctype html><html><head>${BASE_TAG}${ERROR_CAPTURE_SCRIPT_TAG}</head><body>${next}</body></html>`;
    }
  } else if (!next.includes("vibyra-preview-error")) {
    next = next.replace(/<head([^>]*)>/i, `<head$1>${ERROR_CAPTURE_SCRIPT_TAG}`);
  }
  return next;
}

function previewErrorType(value: unknown): PreviewRuntimeError["type"] {
  return value === "console" || value === "resource" || value === "unhandledrejection" ? value : "error";
}

function numeric(value: unknown) { const next = Number(value); return Number.isFinite(next) && next > 0 ? next : undefined; }
