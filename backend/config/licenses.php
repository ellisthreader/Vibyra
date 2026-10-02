<?php

return [
    // Disable new keys/claims without disabling existing expiry or revocation.
    'enabled' => env('MEMBERSHIP_LICENSES_ENABLED', false),
    'max_tokens' => 10000,
    'max_months' => 36,
];
