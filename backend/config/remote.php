<?php

// Vibyra Cloud remote access: the relay a computer connects outward to so a
// phone anywhere can reach its terminals. The relay reads nothing — every
// payload is Noise-encrypted between phone and computer — and this API only
// hands out short-lived, HMAC-signed tokens that let a computer register and a
// phone of the same account connect. See host/docs/protocol.md.
return [
    // The public WebSocket address handed to computers and phones (wss://…).
    'relay_url' => env('VIBYRA_RELAY_URL'),
    // Where this API reaches the relay's admin surface. Defaults to the public
    // address with the WebSocket scheme swapped for HTTP.
    'relay_admin_url' => env('VIBYRA_RELAY_ADMIN_URL'),
    // Shared with the relay (VIBYRA_RELAY_SECRET there). Signs every token and
    // authenticates the presence events the relay posts back. 32+ characters.
    'relay_secret' => env('VIBYRA_RELAY_SECRET'),
    // How long a computer's registration token and a phone's connection token
    // stay valid. Both are checked once, when the socket registers; the
    // connection they open lives on until either side closes it.
    'host_token_seconds' => (int) env('VIBYRA_RELAY_HOST_TOKEN_SECONDS', 600),
    'client_token_seconds' => (int) env('VIBYRA_RELAY_CLIENT_TOKEN_SECONDS', 300),
    // A computer counts as online while its relay heartbeat is this fresh.
    'presence_seconds' => (int) env('VIBYRA_RELAY_PRESENCE_SECONDS', 90),
    'max_hosts_per_user' => 16,
    // Whether connecting from anywhere needs a plan with `remoteAccess`
    // (config/vibes.php). Registering a computer never does.
    'require_plan' => (bool) env('VIBYRA_REMOTE_REQUIRE_PLAN', true),
];
