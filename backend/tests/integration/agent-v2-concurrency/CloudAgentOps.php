<?php

/** Test-only Cloud setup on the harness's guarded disposable PostgreSQL database. */
final class ConcCloudAgentOps
{
    public static function configure(): void
    {
        config(['agents_v2.cloud_enabled' => true, 'cloud_workspaces.enabled' => true, 'cloud_workspaces.starts_enabled' => true,
            'cloud_workspaces.provider_audit_required' => false, 'cloud_workspaces.pilot_users' => [],
            'cloud_workspaces.units_per_hour' => 120000, 'cloud_workspaces.provider_micro_per_hour' => 91700,
            'cloud_workspaces.tariff_version' => 'conc-v1', 'cloud_workspaces.daily_micro_limit' => 100000000,
            'cloud_workspaces.fly_token' => 'test-only', 'cloud_workspaces.fly_org' => 'test-only',
            'cloud_workspaces.image' => 'registry.test/runtime@sha256:'.str_repeat('a', 64),
            'cloud_workspaces.api_origin' => 'https://test.example',
            'cloud_workspaces.lease_private_key' => base64_encode(sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair())),
            'cloud_preview.enabled' => false, 'cloud_preview.economics_verified' => true,
            'cloud_preview.economics' => ['net_micro_per_offer' => ['pro_monthly'=>13993000,'pro_annual'=>139993000,'tokens_80'=>3493000,'tokens_200'=>6993000,'tokens_450'=>13993000],
                'usd_per_gbp' => 1.2, 'vat_fraction' => 0.2, 'fee_fraction' => 0.3, 'fixed_micro_month' => 3200000, 'ai_micro_per_token' => 10000, 'reviewed_at' => now()->toDateTimeString()],
            'cloud_preview.egress_micro_per_gib' => 20000, 'cloud_preview.startup_exposure_micro' => 20000,
            'cloud_preview.profiles.standard.provider_micro_per_hour' => 130000]);
    }
    public static function run(array $a): array
    {
        self::configure();
        if ($a['mode'] === 'wake') {
            app(\App\Services\AgentRuns\Cloud\WakePending::class)->run($a['run']);
            return ['status' => 200, 'json' => ['ok' => true]];
        }
        return ConcHttp::call($a['method'], $a['uri'], $a['token'] ?? null, $a['json'] ?? [], $a['headers'] ?? []);
    }
}
