<?php

return [
    // Off until the owner enables it. Clients hide the "Spending limits" card when the
    // server does not report `enabled: true`, and no spend path reads a counter.
    'enabled' => (bool) env('SPEND_CAPS_ENABLED', false),
    // Whole Vibyra tokens. The preset chips; Custom accepts anything up to `max_tokens`.
    'presets' => [25, 50, 100],
    'max_tokens' => 100000,
    // At which share of a cap the one "nearly there" alert fires. 100% always fires too.
    'warn_at' => 0.8,
];
