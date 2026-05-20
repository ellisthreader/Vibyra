import { headers } from "./http.mjs";
import { isMutableProxyContent, proxyRequestInit, proxyResponseHeaders } from "./previewProxyRequest.mjs";
import { shouldConvertViteModuleError, viteModuleErrorFromHtml, viteModuleErrorJavaScript } from "./previewProxyErrors.mjs";
import { injectProxyHttpErrorOverlay } from "./previewProxyRuntime.mjs";
import { rewriteProxyCss, rewriteProxyHtml, rewriteProxyJavaScript } from "./previewProxyRewrite.mjs";
import { previewProxyContext } from "./previewProxyReferences.mjs";
import { previewShell, sendHtml } from "./previewUi.mjs";


export async function proxyPreviewResponse(res, target, { externalProxy = false, proxyBase, token, req = null }) {
  try {
    const requestInit = await proxyRequestInit(req, target, proxyBase);
    const upstream = await fetch(target, requestInit);
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const status = upstream.status;
    if (shouldConvertViteModuleError(target, status)) {
      const body = await upstream.text();
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
      const body = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(status, responseHeaders);
      res.end(body);
      return;
    }

    let body = await upstream.text();
    if (/text\/html/i.test(contentType)) {
      body = rewriteProxyHtml(body, { externalProxy, proxyBase, target, token, proxyContext });
      if (status >= 400) body = injectProxyHttpErrorOverlay(body, { status, target });
    } else if (/text\/css/i.test(contentType)) {
      body = rewriteProxyCss(body, { externalProxy, proxyBase, target, token, proxyContext });
    } else if (/javascript/i.test(contentType)) {
      body = rewriteProxyJavaScript(body, { externalProxy, proxyBase, target, token, proxyContext });
    }
    res.writeHead(status, responseHeaders);
    res.end(body);
  } catch {
    sendHtml(res, 502, previewShell("Preview server unavailable", "The desktop preview server stopped responding. Start the preview again from Vibyra."));
  }
}
