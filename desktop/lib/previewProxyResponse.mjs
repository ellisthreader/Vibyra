import { Buffer } from "node:buffer";
import { once } from "node:events";
import { headers } from "./http.mjs";
import { acquirePreviewProxySlot, previewProxyLimits, proxyLimitError } from "./previewProxyLimits.mjs";
import { isMutableProxyContent, proxyRequestInit, proxyResponseHeaders } from "./previewProxyRequest.mjs";
import { shouldConvertViteModuleError, viteModuleErrorFromHtml, viteModuleErrorJavaScript } from "./previewProxyErrors.mjs";
import { injectProxyHttpErrorOverlay } from "./previewProxyRuntime.mjs";
import { rewriteProxyCss, rewriteProxyHtml, rewriteProxyJavaScript } from "./previewProxyRewrite.mjs";
import { previewProxyContext } from "./previewProxyReferences.mjs";
import { previewShell, sendHtml } from "./previewUi.mjs";


export async function proxyPreviewResponse(res, target, { externalProxy = false, proxyBase, token, req = null }) {
  const limits = previewProxyLimits();
  const release = acquirePreviewProxySlot(limits.maxConcurrency);
  if (!release) {
    sendHtml(res, 503, previewShell("Preview proxy busy", "Too many preview requests are active. Try again in a moment."));
    return;
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limits.upstreamTimeoutMs);
  try {
    const requestInit = await proxyRequestInit(req, target, proxyBase, {
      maxBodyBytes: limits.maxRequestBodyBytes
    });
    requestInit.signal = controller.signal;
    const upstream = await fetch(target, requestInit);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const status = upstream.status;
    if (shouldConvertViteModuleError(target, status)) {
      const body = (await readLimitedBody(upstream, limits.maxResponseBodyBytes)).toString("utf8");
      const viteError = viteModuleErrorFromHtml(body, target);
      if (viteError) {
        res.writeHead(200, headers("application/javascript; charset=utf-8"));
        res.end(viteModuleErrorJavaScript(viteError));
        return;
      }
    }
    const isText = isMutableProxyContent(contentType);
    const proxyContext = previewProxyContext(target, token);
    const responseHeaders = proxyResponseHeaders(upstream, contentType, { externalProxy, proxyBase, target, token, proxyContext });
    if (!isText) {
      rejectOversizedContentLength(upstream, limits.maxResponseBodyBytes);
      res.writeHead(status, responseHeaders);
      await streamLimitedBody(res, upstream, limits.maxResponseBodyBytes);
      return;
    }

    let body = (await readLimitedBody(upstream, limits.maxResponseBodyBytes)).toString("utf8");
    if (/text\/html/i.test(contentType)) {
      body = rewriteProxyHtml(body, { externalProxy, proxyBase, target, token, proxyContext });
      if (status >= 400) body = injectProxyHttpErrorOverlay(body, { status, target });
    } else if (/text\/css/i.test(contentType)) {
      body = rewriteProxyCss(body, { externalProxy, proxyBase, target, token, proxyContext });
    } else if (/javascript/i.test(contentType)) {
      body = rewriteProxyJavaScript(body, { externalProxy, proxyBase, target, token, proxyContext });
    }
    if (Buffer.byteLength(body) > limits.maxResponseBodyBytes) throw responseTooLarge();
    res.writeHead(status, responseHeaders);
    res.end(body);
  } catch (error) {
    if (res.headersSent) {
      res.destroy?.(error);
      return;
    }
    if (timedOut || error?.name === "AbortError") {
      sendHtml(res, 504, previewShell("Preview server timed out", "The upstream preview server did not respond within the configured time limit."));
      return;
    }
    if (error?.code === "PREVIEW_PROXY_REQUEST_TOO_LARGE") {
      sendHtml(res, 413, previewShell("Preview request too large", "The request body exceeds the configured preview proxy limit."));
      return;
    }
    if (error?.code === "PREVIEW_PROXY_RESPONSE_TOO_LARGE") {
      sendHtml(res, 502, previewShell("Preview response too large", "The upstream response exceeds the configured preview proxy limit."));
      return;
    }
    sendHtml(res, 502, previewShell("Preview server unavailable", "The desktop preview server stopped responding. Start the preview again from Vibyra."));
  } finally {
    clearTimeout(timeout);
    release();
  }
}

async function readLimitedBody(upstream, maxBytes) {
  rejectOversizedContentLength(upstream, maxBytes);
  if (!upstream.body) return Buffer.alloc(0);
  const reader = upstream.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) throw responseTooLarge();
      chunks.push(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, size);
}

async function streamLimitedBody(res, upstream, maxBytes) {
  rejectOversizedContentLength(upstream, maxBytes);
  if (!upstream.body) {
    res.end();
    return;
  }
  const reader = upstream.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      size += chunk.length;
      if (size > maxBytes) throw responseTooLarge();
      if (res.write && !res.write(chunk)) await once(res, "drain");
    }
    res.end();
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  }
}

function rejectOversizedContentLength(upstream, maxBytes) {
  const length = Number.parseInt(String(upstream.headers.get("content-length") ?? ""), 10);
  if (Number.isFinite(length) && length > maxBytes) throw responseTooLarge();
}

function responseTooLarge() {
  return proxyLimitError(
    "Preview response exceeds the configured limit",
    502,
    "PREVIEW_PROXY_RESPONSE_TOO_LARGE"
  );
}
