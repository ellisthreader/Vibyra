<?php

namespace Tests\Feature;

use App\Services\ModelCatalog\AutomationKeys;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ModelCatalogKeysTest extends TestCase
{
    public function test_only_dedicated_daily_capped_keys_are_accepted(): void
    {
        config(['model_catalog.probe_key' => 'probe-test', 'model_catalog.image_key' => 'image-test']);
        $data = ['limit' => 5, 'limit_reset' => 'daily', 'include_byok_in_limit' => true];
        Http::fake(['*' => fn () => Http::response(['data' => $data])]);
        app(AutomationKeys::class)->verify('probe');
        $this->expectException(\RuntimeException::class);
        app(AutomationKeys::class)->verify('artwork'); // A $5 image key exceeds its $2 cap.
    }

    public function test_unlimited_or_monthly_keys_cannot_enable_paid_jobs(): void
    {
        config(['model_catalog.probe_key' => 'probe-test']);
        foreach ([['limit' => null, 'limit_reset' => 'daily'], ['limit' => 5, 'limit_reset' => 'monthly']] as $data) {
            Http::fake(['*' => Http::response(['data' => [...$data, 'include_byok_in_limit' => true]])]);
            try { app(AutomationKeys::class)->verify('probe'); $this->fail('Unbounded key accepted'); }
            catch (\RuntimeException $e) { $this->assertStringContainsString('daily cap', $e->getMessage()); }
        }
    }

    public function test_byok_exclusion_and_management_access_block_paid_automation(): void
    {
        config(['model_catalog.probe_key' => 'probe-test', 'model_catalog.image_key' => 'image-test']);
        foreach ([['include_byok_in_limit' => false], ['include_byok_in_limit' => true, 'is_management_key' => true]] as $extra) {
            Http::fake(['*' => Http::response(['data' => ['limit' => 5, 'limit_reset' => 'daily', ...$extra]])]);
            try { app(AutomationKeys::class)->verify('probe'); $this->fail('Unsafe automation credential accepted'); }
            catch (\RuntimeException $e) { $this->assertStringContainsString('daily cap', $e->getMessage()); }
        }
    }

    public function test_reused_customer_inference_keys_are_rejected_before_network_access(): void
    {
        config(['model_catalog.probe_key' => 'shared-test', 'services.openrouter.key' => 'shared-test']);
        Http::fake();
        try { app(AutomationKeys::class)->verify('probe'); $this->fail('Customer inference key accepted'); }
        catch (\RuntimeException $e) { $this->assertStringContainsString('Dedicated', $e->getMessage()); }
        Http::assertNothingSent();
    }

}
