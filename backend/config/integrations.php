<?php

// Separate registrations from Vibyra identity login and Vibyra's own billing.
return [
    'google' => ['client_id' => env('INTEGRATIONS_GOOGLE_CLIENT_ID'), 'client_secret' => env('INTEGRATIONS_GOOGLE_CLIENT_SECRET')],
    'microsoft' => ['client_id' => env('INTEGRATIONS_MICROSOFT_CLIENT_ID'), 'client_secret' => env('INTEGRATIONS_MICROSOFT_CLIENT_SECRET')],
    'stripe' => ['client_id' => env('INTEGRATIONS_STRIPE_CLIENT_ID'), 'client_secret' => env('INTEGRATIONS_STRIPE_DEVELOPER_KEY'),
        'install_url' => env('INTEGRATIONS_STRIPE_INSTALL_URL'), 'mode' => env('INTEGRATIONS_STRIPE_MODE', 'test')],
    'shopify' => ['client_id' => env('INTEGRATIONS_SHOPIFY_CLIENT_ID'), 'client_secret' => env('INTEGRATIONS_SHOPIFY_CLIENT_SECRET')],
    'github' => ['client_id' => env('INTEGRATIONS_GITHUB_CLIENT_ID'), 'client_secret' => env('INTEGRATIONS_GITHUB_CLIENT_SECRET')],
];
