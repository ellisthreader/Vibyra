<?php

namespace App\Services\Teams\Sso;

use App\Models\OrganizationSso;

/** Bind login and delayed provider/DNS responses to the exact reviewed configuration. */
final class Configuration
{
    public static function hash(OrganizationSso $config): string
    {
        return hash('sha256', json_encode([$config->organization_id, $config->issuer, $config->client_id,
            $config->client_secret, $config->domain, $config->domain_token, $config->verified_domain,
            $config->enabled, $config->require_sso], JSON_THROW_ON_ERROR));
    }

    public static function requireCurrent(OrganizationSso $config, ?string $expected): void
    {
        if (!$config->enabled || $config->verified_domain === null || !is_string($expected)
            || !hash_equals($expected, self::hash($config))) throw new SsoException('sso_unavailable');
    }
}
