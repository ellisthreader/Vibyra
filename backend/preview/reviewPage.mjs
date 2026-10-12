export function reviewPage(url) {
  const query = new URLSearchParams(url.searchParams);
  query.set("embed", "1");
  const source = "/owner?" + query.toString().replaceAll("&", "&amp;");
  const views = ["overview", "users", "downloads", "memberships", "website", "usage", "tracking"];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Owner responsive review</title>
    <style>body{margin:0;background:#dde1e8;font:14px system-ui;color:#171a21}header{padding:16px 24px;background:white;display:flex;gap:16px;align-items:center}main{display:flex;gap:24px;padding:24px;align-items:flex-start}iframe{display:block;border:0;background:white;border-radius:12px;box-shadow:0 6px 30px #17234415}h2{font-size:14px}a{color:#315bd8}</style>
    </head><body><header><strong>Responsive review · synthetic data</strong>
    ${views.map(view => `<a href="/review?view=${view}">${view}</a>`).join("")}
    <a href="/owner">Full dashboard</a></header><main>
    <section><h2>Phone · 390px</h2><iframe title="Phone dashboard" width="390" height="780" src="${source}"></iframe></section>
    <section><h2>Tablet · 768px</h2><iframe title="Tablet dashboard" width="768" height="780" src="${source}"></iframe></section>
    </main></body></html>`;
}
