// Injected into every frame (Page.addScriptToEvaluateOnNewDocument), and
// evaluated inside every worker, before any page script runs. The agent
// browser's approval gate lives in CDP Fetch interception, which never sees
// WebSocket frames, EventSource streams, WebTransport or WebRTC data
// channels, so those constructors do not exist for page code: a site's own
// "Send" button cannot push a message over a socket the person never
// approved. Plain GET navigation and fetches are unchanged, and POST-style
// sends stay gated by Fetch (approved `browser_submit` only).
(function () {
  'use strict';
  const scope = typeof globalThis === 'undefined' ? self : globalThis;
  const deny = (name) => {
    const stub = function () {
      throw new DOMException(name + ' is turned off in the Vibyra agent browser.', 'SecurityError');
    };
    Object.defineProperty(stub, 'name', { value: name });
    return stub;
  };
  const replace = (target, key, value) => {
    try {
      Object.defineProperty(target, key, { value, writable: false, configurable: false, enumerable: false });
    } catch (_) {
      try { target[key] = value; } catch (__) { /* a non-configurable host object */ }
    }
  };
  for (const name of ['WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport',
    'RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSctpTransport']) {
    if (name in scope) replace(scope, name, deny(name));
  }
  // A beacon that cannot be queued reports false, as the standard says it may.
  const nav = scope.navigator;
  if (nav && 'sendBeacon' in nav) {
    const beacon = function sendBeacon() { return false; };
    replace(Object.getPrototypeOf(nav), 'sendBeacon', beacon);
    try { replace(nav, 'sendBeacon', beacon); } catch (_) { /* inherited */ }
  }
})();
