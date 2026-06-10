<?php

return [
    'legacy_routes_enabled' => env(
        'VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED',
        in_array(env('APP_ENV', 'production'), ['local', 'testing'], true),
    ),
];
