<?php
namespace Tests\Feature\CloudComputer;
use Illuminate\Support\Str;
abstract class ComputeTestCase extends ComputerTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_preview.enabled' => true, 'cloud_preview.economics_verified' => true,
            'cloud_preview.economics' => ['net_micro_per_offer'=>['pro_monthly'=>13993000,'pro_annual'=>139993000,'tokens_80'=>3493000,'tokens_200'=>6993000,'tokens_450'=>13993000], 'usd_per_gbp' => 1.2, 'vat_fraction' => 0.2, 'fee_fraction' => 0.3,
                'fixed_micro_month' => 3200000, 'ai_micro_per_token' => 10000, 'reviewed_at' => now()->toDateTimeString()],
            'cloud_preview.egress_micro_per_gib' => 20000,
            'cloud_preview.startup_exposure_micro' => 20000,
            'cloud_preview.profiles.standard.provider_micro_per_hour' => 130000,
            'cloud_preview.profiles.desktop.provider_micro_per_hour' => 165000,
            'cloud_preview.profiles.power.provider_micro_per_hour' => 230000]);
        $this->createComputer();
    }
    protected function quote(string $profile = 'standard', int $budget = 100000): array
    {
        return $this->postJson('/api/cloud-computer/compute/quote', ['profile' => $profile,
            'deviceId' => $this->device->uuid, 'budgetUnits' => $budget])->assertOk()->json('quote');
    }
    protected function accept(array $q, ?string $request = null): array
    {
        return ['quoteId' => $q['id'], 'deviceId' => $this->device->uuid, 'requestId' => $request ?? (string) Str::uuid(), 'acceptTerms' => true];
    }
}
