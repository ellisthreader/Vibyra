//! The pages the Agent browser tests load. `allowed.test` is granted; pages
//! that try to reach out (sockets, workers, forms) log what got through.

/// `(status, content type or redirect target, body)`.
pub fn page(port: u16, path: &str) -> (u16, String, String) {
    let html = |body: &str| (200, "text/html; charset=utf-8".to_owned(), body.to_owned());
    let route = path.split('?').next().unwrap_or(path);
    match route {
        "/" => html(&format!(
            r#"<title>Shop</title><h1>Welcome</h1>
<p>api_key=sk-live-SECRETSECRET1234 and token: abcdefabcdefabcdefabcdefabcdefabcdefabcd</p>
<a href="/next">Next page</a> <a href="http://blocked.test:{port}/landing">Away</a> <a href="/redirect">Bounce</a>
<button onclick="window.open('/popup')">Pop</button>
<button onclick="fetch('/api', {{method: 'POST', body: 'x'}})">Save</button>
<img src="http://internal.test:{port}/pixel.gif"><img src="http://blocked.test:{port}/pixel.gif">
<form action="/send" method="post"><label>To <input name="to" value="a@example.com"></label>
<label>Password <input name="pw" type="password" value="hunter2"></label>
<input type="hidden" name="csrf" value="tok123"><button type="submit">Send</button></form>"#
        )),
        "/next" => html("<title>Next</title><h1>Next</h1>"),
        "/popup" => html("<title>Popup</title><h1>Popup</h1>"),
        "/send" => html("<title>Sent</title><h1>Sent</h1>"),
        "/fail" => (500, "text/html".into(), "<title>Broken</title>oops".into()),
        "/redirect" => (
            302,
            format!("http://blocked.test:{port}/landing"),
            String::new(),
        ),
        "/sw-page" => html(
            r#"<title>SW</title><script>
navigator.serviceWorker.register('/sw.js').then(function () { return navigator.serviceWorker.ready; })
  .then(function (reg) { navigator.serviceWorker.onmessage = function (e) { window.swSaid = e.data; };
    reg.active.postMessage('go'); })
  .catch(function (e) { window.swSaid = 'register-failed-' + e.name; });
</script>"#,
        ),
        "/ws-child" => html(&format!(
            r#"<script>try {{ new WebSocket('ws://localhost:{port}/sock'); parent.postMessage('cross-site-open', '*'); }}
catch (e) {{ parent.postMessage('cross-site-blocked-' + e.name, '*'); }}</script>"#
        )),
        "/w.js" => (200, "text/javascript".into(), worker(port)),
        "/sw.js" => (200, "text/javascript".into(), service_worker(port)),
        "/big" => html(&big()),
        "/disabled" => html(
            r#"<title>Disabled</title><form action="/send" method="post"><input name="to" value="x">
<button type="submit" disabled>Send now</button></form>"#,
        ),
        "/broken-form" => html(
            r#"<title>Broken form</title><form action="/fail" method="post"><input name="to" value="x">
<button type="submit">Send</button></form>"#,
        ),
        "/stopped-form" => html(
            r#"<title>Stopped form</title><form action="/send" method="post" onsubmit="return false"><input name="to" value="x">
<button type="submit">Send</button></form>"#,
        ),
        "/focus" => html(
            r#"<title>Focus</title><label>Name <input id="a" name="a" onfocus="document.getElementById('pw').focus()"></label>
<input id="pw" name="pw" type="password"><input id="ssn" name="ssn" value="078-05-1120"><input name="iban" value="GB82WEST">"#,
        ),
        p if p.starts_with("/sockets") => html(&sockets(port)),
        p if p.starts_with("/reset/") => html("<title>Reset</title><h1>Reset</h1><a href=\"/next#access_token=ya29.LINKSECRET\">Link</a>"),
        _ => (200, "text/plain".to_owned(), "ok".to_owned()),
    }
}

fn socket_url(port: u16) -> String {
    format!("ws://allowed.test:{port}/sock")
}

/// Every way a page can try to open a socket from a click or at load.
fn sockets(port: u16) -> String {
    let url = socket_url(port);
    format!(
        r#"<title>Sockets</title><h1>Chat</h1><input name="msg" placeholder="Message">
<button onclick="lazy()">Send message</button>
<button onclick="frame()">Frame</button>
<button onclick="stream()">Stream</button>
<button onclick="frames()">Frames</button>
<script>
function report(t) {{ document.title = t; }}
function lazy() {{
  try {{ var ws = new WebSocket('{url}'); ws.onopen = function () {{ ws.send('lazy-click'); report('sent'); }};
    ws.onerror = function () {{ report('socket-error'); }}; }} catch (e) {{ report('blocked-' + e.name); }}
}}
function frame() {{
  var f = document.createElement('iframe'); document.body.appendChild(f);
  try {{ var W = f.contentWindow.WebSocket; var ws = new W('{url}'); ws.onopen = function () {{ ws.send('iframe-click'); }};
    report('frame-open'); }} catch (e) {{ report('blocked-' + e.name); }}
}}
window.framesSaid = [];
window.addEventListener('message', function (e) {{ window.framesSaid.push(String(e.data)); }});
function frames() {{
  function code(tag) {{ return '<script>try {{ new WebSocket("{url}"); parent.postMessage("' + tag + '-open", "*"); }} catch (e) {{ parent.postMessage("' + tag + '-blocked-" + e.name, "*"); }}<\/script>'; }}
  var a = document.createElement('iframe'); a.srcdoc = code('srcdoc'); document.body.appendChild(a);
  var b = document.createElement('iframe'); b.setAttribute('sandbox', 'allow-scripts'); b.srcdoc = code('sandbox'); document.body.appendChild(b);
  var c = document.createElement('iframe'); c.src = 'http://localhost:{port}/ws-child'; document.body.appendChild(c);
}}
function stream() {{
  try {{ new EventSource('/events'); report('es-open'); }} catch (e) {{ report('blocked-' + e.name); }}
}}
try {{ window.early = new WebSocket('{url}'); window.early.onopen = function () {{ window.early.send('early'); }}; }} catch (e) {{}}
var w = new Worker('/w.js'); w.onmessage = function (e) {{ window.workerSaid = e.data; }};
var blob = new Worker(URL.createObjectURL(new Blob(['try {{ new WebSocket("{url}"); postMessage("blob-open"); }} catch (e) {{ postMessage("blob-blocked-" + e.name); }}'])));
blob.onmessage = function (e) {{ window.blobSaid = e.data; }};
try {{ var sw = new SharedWorker('/w.js'); sw.port.onmessage = function (e) {{ window.sharedSaid = e.data; }}; sw.port.start(); }} catch (e) {{}}
</script>"#
    )
}

fn worker(port: u16) -> String {
    let url = socket_url(port);
    format!(
        r#"function tell(m, port) {{ if (port) port.postMessage(m); else postMessage(m); }}
function attempt(port) {{ try {{ var ws = new WebSocket('{url}'); ws.onopen = function () {{ ws.send('worker-frame'); }}; tell('worker-open', port); }}
  catch (e) {{ tell('worker-blocked-' + e.name, port); }} }}
if (typeof onconnect !== 'undefined' || typeof SharedWorkerGlobalScope !== 'undefined') {{ onconnect = function (e) {{ attempt(e.ports[0]); }}; }}
else attempt(null);"#
    )
}

fn service_worker(port: u16) -> String {
    let url = socket_url(port).replace("allowed.test", "localhost");
    format!(
        r#"self.addEventListener('install', function () {{ self.skipWaiting(); }});
self.addEventListener('activate', function (e) {{ e.waitUntil(clients.claim()); }});
self.addEventListener('message', function (e) {{
  try {{ var ws = new WebSocket('{url}'); ws.onopen = function () {{ ws.send('sw-frame'); }}; e.source.postMessage('sw-open'); }}
  catch (err) {{ e.source.postMessage('sw-blocked-' + err.name); }}
}});"#
    )
}

/// 30 fields, a hidden value, a select, a checkbox and seven forms: more than any summary shows.
fn big() -> String {
    let fields: String = (1..=30)
        .map(|i| format!(r#"<label>Field {i} <input name="f{i}" value="v{i}"></label>"#))
        .collect();
    let forms: String = (2..=7)
        .map(|i| format!(r#"<form action="/send" method="post"><input name="g{i}" value="w{i}"><button name="b{i}" value="go{i}">Go {i}</button></form>"#))
        .collect();
    format!(
        r#"<title>Big</title><form id="main" action="/send" method="post">{fields}
<input type="hidden" name="h" value="H1"><select name="s"><option value="a" selected>Alpha</option><option value="b">Beta</option></select>
<label>Agree <input type="checkbox" name="c" value="yes"></label>
<button type="submit" name="go" value="1">Send all</button></form>{forms}"#
    )
}
