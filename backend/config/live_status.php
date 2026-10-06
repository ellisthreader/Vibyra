<?php

/*
 * Mac status on the iPhone (Live Activity) while the phone is locked. Off by default.
 *
 * The Mac sends the same names-only snapshot it shows in its menu bar; the server turns it
 * into the computer card and pushes it through APNs (push type `liveactivity`). The APNs
 * auth key (.p8) comes only from the hosting secret store: APNS_AUTH_KEY (PEM text, newlines
 * as \n) or APNS_AUTH_KEY_PATH. It is never written to the repository, a log or a response.
 */
return [
    'enabled' => (bool) env('LIVE_STATUS_ENABLED', false),
    'topic' => env('LIVE_ACTIVITY_TOPIC', 'app.vibyra.mobile.push-type.liveactivity'),
    // Ordinary alert notifications (push type `alert`) go to the bare bundle id.
    'alert_topic' => env('APNS_ALERT_TOPIC', 'app.vibyra.mobile'),
    'attributes_type' => 'VibyraComputerAttributes',
    'apns' => [
        'key_id' => env('APNS_KEY_ID'),
        'team_id' => env('APNS_TEAM_ID', '6WXKN5P8K5'),
        'key' => env('APNS_AUTH_KEY'),
        'key_path' => env('APNS_AUTH_KEY_PATH'),
        'timeout' => 10,
    ],
    // The Mac re-sends at least this often while it runs; the card goes stale after this.
    'stale_minutes' => 20,
    // With nothing working or waiting for this long, the card ends. The owner wants one card only
    // while something runs, never a "nothing running" card; the short wait rides out quiet spells.
    'idle_end_minutes' => 3,
    // An unchanged card is re-sent this often so its stale date moves forward.
    'heartbeat_minutes' => 8,
];
