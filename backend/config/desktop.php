<?php

return [
    'legacy_routes_enabled' => in_array(
        env('APP_ENV', 'production'),
        ['local', 'testing'],
        true,
    ) && env('VIBYRA_LEGACY_DESKTOP_ROUTES_ENABLED', true),
];
