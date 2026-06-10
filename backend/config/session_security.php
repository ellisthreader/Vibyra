<?php

return [
    'lifecycle_mode' => env('VIBYRA_SESSION_LIFECYCLE_MODE', 'enforce'),
    'idle_minutes' => (int) env('VIBYRA_SESSION_IDLE_MINUTES', 20160),
    'absolute_minutes' => (int) env('VIBYRA_SESSION_ABSOLUTE_MINUTES', 129600),
    'rotation_mode' => env('VIBYRA_SESSION_ROTATION_MODE', 'manual'),
    'previous_token_grace_seconds' => (int) env('VIBYRA_SESSION_PREVIOUS_TOKEN_GRACE_SECONDS', 120),
];
