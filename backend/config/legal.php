<?php

return [
    // Bump these when the published documents change materially. Keep a copy of
    // each published version with the release evidence packet.
    'terms_version' => '2026-09-28',
    'privacy_version' => '2026-09-28',
    // Existing test fixtures intentionally opt out; production defaults on.
    'enforce_signup_acceptance' => filter_var(env('LEGAL_SIGNUP_ENFORCEMENT', true), FILTER_VALIDATE_BOOLEAN),
    // Account creation is UK-first. Additional countries require a reviewed
    // market entry before they can be enabled in a release.
    'account_countries' => ['GB'],
    'enforce_market_access' => filter_var(env('LEGAL_MARKET_ENFORCEMENT', true), FILTER_VALIDATE_BOOLEAN),
    // Trust only configured ingress peers, then strip trusted X-Forwarded-For hops from the right.
    'trusted_proxy_cidrs' => array_values(array_filter(array_map('trim',
        explode(',', (string) env('LEGAL_TRUSTED_PROXY_CIDRS', ''))))),
    'paid_sales_enabled' => filter_var(env('LEGAL_PAID_SALES_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
    // Public sharing opens only after a documented community safety release review.
    'community_enabled' => filter_var(env('LEGAL_COMMUNITY_ENABLED', false), FILTER_VALIDATE_BOOLEAN),
];
