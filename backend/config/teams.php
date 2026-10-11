<?php

/*
 * Roadmap Part 13: organizations ("Teams"), kept small. Everything is off until TEAMS_ENABLED is on; every route answers 404
 * while it is off. Contract: docs/teams-contract.md. Seat prices and Stripe quantity live with the rest of Membership v2
 * in config/membership.php (`teams`).
 */
return [
    'enabled' => (bool) env('TEAMS_ENABLED', false),
    // Token-cap administration requires its separately delivered spend engine.
    'member_caps_enabled' => (bool) env('TEAMS_MEMBER_CAPS_ENABLED', false),
    // Plan gate `teams`: when on, only an account on one of these plans may create an organization (joining one is never gated).
    'plan_gate' => (bool) env('TEAMS_PLAN_GATE', false),
    'plans' => ['pro_v2', 'pro', 'builder', 'team_v2'],
    'invite_days' => 7,
    'max_members' => 200,
    'max_pending_invites' => 50,
    'name_max' => 80,
    // OIDC: how long a sign-in may take between the redirect and the callback, and the clock skew an ID token may carry.
    'sso_flow_minutes' => 10,
    'sso_clock_skew' => 60,
    'sso_scopes' => 'openid email profile',
    // Domain claim: the TXT record lives at {prefix}.{domain} and holds `vibyra-verify={token}`.
    'dns_prefix' => '_vibyra-verify',
];
