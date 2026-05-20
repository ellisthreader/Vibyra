
import { headers } from "./http.mjs";

export function previewCrashScreenHtml({ detail, eyebrow, message, title }) {
  return [
    '<main id="vibyra-preview-http-error" style="box-sizing:border-box;min-height:100vh;margin:0;padding:clamp(16px,5vw,32px);background:radial-gradient(circle at 50% 22%,rgba(80,35,145,.18),transparent 46%),#030511;color:#f7f3ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto;">',
    previewCrashPanelHtml({ detail, eyebrow, message, title }),
    "</main>"
  ].join("");
}

export function previewCrashPanelHtml({ detail, eyebrow, message, title }) {
  const resolvedDetail = detail || message;
  return [
    '<section style="box-sizing:border-box;width:min(640px,calc(100vw - 40px));min-height:min(430px,calc(100vh - 96px));max-height:calc(100vh - 40px);display:flex;flex-direction:column;justify-content:center;border:1px solid rgba(142,60,255,.52);border-radius:22px;background:rgba(8,10,22,.96);padding:clamp(22px,5vw,36px);box-shadow:0 18px 54px rgba(0,0,0,.34);overflow:hidden">',
    '<div style="box-sizing:border-box;width:100%;margin:0 auto">',
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:22px;color:#ff5f76;font-size:13px;font-weight:900;letter-spacing:.01em;text-transform:uppercase">',
    '<span aria-hidden="true" style="box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid #ff5f76;border-radius:999px;font-size:18px;line-height:1">!</span>',
    '<span>' + escapeHtml(eyebrow) + '</span>',
    '</div>',
    '<h1 style="margin:0 0 20px;font-size:clamp(30px,6vw,42px);line-height:1.05;color:#fff;font-weight:900;letter-spacing:0">' + escapeHtml(title) + '</h1>',
    '<div style="height:1px;background:rgba(255,255,255,.14);margin:0 0 20px"></div>',
    '<p style="margin:0;color:#d8d2e4;font-size:clamp(15px,3.2vw,18px);font-weight:500;line-height:1.55;word-break:break-word">' + escapeHtml(message) + '</p>',
    '<details style="margin-top:24px;color:#f7f3ff">',
    '<summary style="box-sizing:border-box;cursor:pointer;list-style:none;display:flex;align-items:center;gap:12px;width:100%;min-height:58px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.035);padding:0 16px;font-size:15px;font-weight:900">',
    '<span aria-hidden="true" style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:rgba(142,60,255,.14);color:#b064ff;font-size:13px;font-weight:900">&lt;/&gt;</span>',
    '<span style="flex:1">Show technical details</span><span aria-hidden="true" style="color:#d8d2e4;font-size:18px">&#8964;</span>',
    '</summary>',
    '<pre style="box-sizing:border-box;max-height:min(28vh,220px);overflow:auto;margin:12px 0 0;white-space:pre-wrap;background:#070911;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:12px;color:#eee8fa;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace">' + escapeHtml(resolvedDetail) + '</pre>',
    '</details>',
    '</div>',
    '</section>'
  ].join("");
}

export function sendHtml(res, status, html) {
  res.writeHead(status, headers("text/html; charset=utf-8"));
  res.end(html);
}

export function redirect(res, location) {
  res.writeHead(302, { ...headers("text/plain; charset=utf-8"), Location: location });
  res.end(`Redirecting to ${location}`);
}

export function previewShell(title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: dark; --bg: #07080f; --panel: #10121c; --line: #2c2442; --text: #f7f3ff; --muted: #b8b1ca; --accent: #7c3cff; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      main { width: min(560px, 100%); border: 1px solid var(--line); border-radius: 18px; background: var(--panel); padding: 26px; }
      h1 { margin: 0 0 10px; font-size: clamp(28px, 8vw, 48px); line-height: 1; }
      p { margin: 0; color: var(--muted); font-size: 16px; font-weight: 700; line-height: 1.55; }
    </style>
  </head>
  <body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body>
</html>`;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
