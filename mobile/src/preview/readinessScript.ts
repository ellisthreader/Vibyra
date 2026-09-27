/** Read-only page observation; messages cannot invoke Host or native actions. */
export const previewReadinessScript = `
(() => {
  if (window.top !== window || window.__vibyraPreviewObserver) return;
  window.__vibyraPreviewObserver = true;
  let sent = false, rendered = false, scriptError = '', timer;
  const started = Date.now();
  const send = (kind, detail) => window.ReactNativeWebView.postMessage(JSON.stringify({
    preview: 1, kind, detail, url: location.href
  }));
  // WebKit restores history documents without rerunning their injected scripts.
  addEventListener('pageshow', event => {
    if (event.persisted && rendered) requestAnimationFrame(() => send('ready'));
  });
  addEventListener('error', event => { if (event.message) scriptError = String(event.message).slice(0, 500); });
  addEventListener('unhandledrejection', () => { scriptError ||= 'The website reported an unhandled JavaScript error.'; });
  const check = () => {
    if (sent) return;
    const root = document.querySelector('#app[data-page], #root, #__next') || document.body;
    const text = (root?.innerText || '').trim();
    const visual = root?.querySelector('img, svg, canvas, video, input, button');
    const fatal = /^(Fatal error|Parse error|Warning: require|Uncaught Error)/i.test(text);
    const onlyWarnings = /^(Deprecated|Warning):/i.test(text) && !root?.querySelector('main, nav, article, section');
    if (document.readyState !== 'loading' && root && !fatal && !onlyWarnings && (text || visual)) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!sent) { sent = true; rendered = true; clearTimeout(timer); send('ready'); }
      }));
    } else if (Date.now() - started >= 25000) {
      sent = true;
      send('failed', scriptError || (fatal ? 'The website returned a PHP startup error.' : 'The document arrived but its app did not render.'));
    } else timer = setTimeout(check, 100);
  };
  check();
})(); true;`;
