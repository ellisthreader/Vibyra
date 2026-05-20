import { injectProxyHttpErrorOverlay, injectProxyRuntimeErrorOverlay } from "./previewProxyRuntime.mjs";
import { rewriteProxyReference } from "./previewProxyReferences.mjs";


export function rewriteProxyHtml(html, { externalProxy, proxyBase, target, token, proxyContext }) {
  const rewriteOptions = { externalProxy, proxyBase, target, token, proxyContext };
  return injectProxyRuntimeErrorOverlay(html)
    .replace(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_match, open, script, close) => {
      if (!shouldRewriteInlineScript(open)) return `${open}${script}${close}`;
      return `${open}${rewriteProxyJavaScript(script, rewriteOptions)}${close}`;
    })
    .replace(/\b(src|href|action|formaction)=["']([^"']+)["']/gi, (_match, attr, value) => {
      return `${attr}="${rewriteProxyReference(value, rewriteOptions)}"`;
    })
    .replace(/\bstyle=(["'])(.*?)\1/gi, (_match, quote, value) => {
      return `style=${quote}${rewriteProxyStyleUrls(value, rewriteOptions)}${quote}`;
    });
}

export function shouldRewriteInlineScript(openTag) {
  const tag = String(openTag || "");
  if (/\btype=(["'])(?:application\/json|importmap)\1/i.test(tag)) return false;
  return true;
}

export function rewriteProxyCss(css, { externalProxy, proxyBase, target, token, proxyContext }) {
  return css
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
      return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote})`;
    })
    .replace(/@import\s+(["'])([^"']+)\1/gi, (_match, quote, value) => {
      return `@import ${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    });
}

export function rewriteProxyStyleUrls(style, { externalProxy, proxyBase, target, token, proxyContext }) {
  return String(style).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, value) => {
    return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote})`;
  });
}

export function rewriteProxyJavaScript(js, { externalProxy, proxyBase, target, token, proxyContext }) {
  const rewritten = js
    .replace(/(["'`])((?:https?:\\\/\\\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)[^"'`]+)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value.replace(/\\\//g, "/"), { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    })
    .replace(/(["'`])((?:https?:\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[[^\]]+\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[0-1])\.\d+\.\d+)[^"'`]+)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    })
    .replace(/\b((?:import|export)\s+(?:[^"'`]*?\s+from\s*)?)(["'`])((?:\/(?!\/))[^"'`]+)\2/g, (_match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext, forceUpstream: true })}${quote}`;
    })
    .replace(/\b(import\s*\(\s*)(["'`])((?:\/(?!\/))[^"'`]+)\2/g, (_match, prefix, quote, value) => {
      return `${prefix}${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext, forceUpstream: true })}${quote}`;
    })
    .replace(/(["'`])(\/(?!\/)[^"'`]+?\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)(?:[?#][^"'`]*)?)\1/gi, (_match, quote, value) => {
      return `${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote}`;
    })
    .replace(/url\(\s*(["']?)(\/(?!\/)[^"')]+?\.(?:avif|bmp|gif|glb|gltf|ico|jpe?g|json|m4v|mov|mp3|mp4|ogg|otf|pdf|png|svg|ttf|wasm|wav|webm|webp|woff2?)(?:[?#][^"')]*)?)\1\s*\)/gi, (_match, quote, value) => {
      return `url(${quote}${rewriteProxyReference(value, { externalProxy, proxyBase, target, token, proxyContext })}${quote})`;
    });
  return rewriteViteClientHmrForPreview(rewritten, { target });
}

export function rewriteViteClientHmrForPreview(js, { target }) {
  if (target?.pathname !== "/@vite/client") return js;
  return js.replace(
    /transport\.connect\(createHMRHandler\(handleMessage\)\);\s*setupForwardConsoleHandler\(transport, forwardConsole\);/,
    [
      'if (!import.meta.url.includes("/preview/proxy-url/")) {',
      'transport.connect(createHMRHandler(handleMessage));',
      'setupForwardConsoleHandler(transport, forwardConsole);',
      '}'
    ].join("\n")
  );
}
