<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\{TwoFactor, Totp};
use App\Services\Membership\Licenses\Keys;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class OwnerLicensesTest extends TestCase
{
    use RefreshDatabase;
    private User $owner;
    protected function setUp(): void
    {
        parent::setUp();
        config(['licenses.enabled' => true, 'membership.enabled' => true, 'owner_analytics.emails' => ['owner@example.test']]);
        $this->owner = User::factory()->create(['email' => 'owner@example.test']);
    }
    private function unlock(): void
    {
        $two = app(TwoFactor::class); $totp = app(Totp::class);
        $secret = $two->start($this->owner);
        $two->confirm($this->owner, $totp->at($totp->decode($secret), intdiv(time(), Totp::PERIOD)));
        $this->actingAs($this->owner)->withSession(['owner_second_factor_user_id' => $this->owner->id,
            'owner_second_factor_verified_at' => now()->timestamp]);
    }
    private function terms(array $overrides = []): array
    {
        return [...['request_id' => (string) Str::uuid(), 'label' => 'Recipient', 'tokens' => 300,
            'allowance' => 'monthly', 'duration_months' => 1, 'claim_by' => now()->addMonth()->toIso8601String()], ...$overrides];
    }
    public function test_owner_and_recent_two_factor_required_for_every_action(): void
    {
        $id = (string) Str::uuid();
        $this->getJson('/web-api/owner/licenses')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->postJson('/web-api/owner/licenses', $this->terms())->assertForbidden();
        $this->actingAs($this->owner)->getJson('/web-api/owner/licenses')->assertStatus(428);
        $this->postJson('/web-api/owner/licenses', $this->terms())->assertStatus(428);
        $this->postJson('/web-api/owner/licenses/'.$id.'/revoke')->assertStatus(428);
        $this->unlock();
        $this->getJson('/web-api/owner/licenses')->assertOk();
        $this->withSession(['owner_second_factor_user_id' => $this->owner->id + 1])->getJson('/web-api/owner/licenses')->assertStatus(428);
        $this->withSession(['owner_second_factor_user_id' => $this->owner->id, 'owner_second_factor_verified_at' => now()->subMinutes(11)->timestamp])
            ->postJson('/web-api/owner/licenses', $this->terms())->assertStatus(428);
    }
    public function test_keys_are_one_time_responses_and_issuance_is_idempotent(): void
    {
        $this->unlock(); $terms = $this->terms();
        $key = $this->postJson('/web-api/owner/licenses', $terms)->assertCreated()->json('key');
        $this->assertNotNull(Keys::hash($key));
        $this->postJson('/web-api/owner/licenses', $terms)->assertCreated()->assertJsonPath('key', null)->assertJsonPath('replayed', true);
        $this->postJson('/web-api/owner/licenses', [...$terms, 'tokens' => 999])->assertConflict();
        $response = $this->getJson('/web-api/owner/licenses')->assertOk();
        $this->assertStringNotContainsString($key, $response->getContent());
        $this->assertStringNotContainsString(Keys::hash($key), $response->getContent());
        $this->assertDatabaseCount('membership_licenses', 1);
        $this->assertDatabaseCount('membership_license_audits', 1);
    }
    public function test_server_rejects_excessive_negative_fractional_and_conflicting_terms(): void
    {
        $this->unlock();
        foreach ([['tokens' => -1], ['tokens' => 0.5], ['tokens' => 10001], ['duration_months' => 37],
            ['fixed_ends_at' => now()->addMonth()->toIso8601String()], ['claim_by' => now()->subDay()->toIso8601String()]] as $invalid) {
            $this->postJson('/web-api/owner/licenses', $this->terms($invalid))->assertUnprocessable();
        }
        $this->assertDatabaseCount('membership_licenses', 0);
    }
    public function test_html_validation_cannot_flash_key_and_cookie_does_not_authorize_native_route(): void
    {
        $this->unlock(); $secret = Keys::generate();
        $this->post('/web-api/owner/licenses', ['licenseKey' => $secret])->assertRedirect();
        $this->assertArrayNotHasKey('licenseKey', session('_old_input', []));
        $this->assertStringNotContainsString($secret, json_encode(session()->all()));
        $this->postJson('/api/account/license', ['licenseKey' => $secret])->assertUnauthorized();
    }

    public function test_stale_browser_account_scope_does_not_consume_the_key(): void
    {
        $this->unlock();
        $created = $this->postJson('/web-api/owner/licenses', $this->terms())->assertCreated()->json();
        $other = User::factory()->create();
        $this->actingAs($other)->postJson('/web-api/account/license', ['licenseKey' => $created['key'], 'expectedAccountId' => $this->owner->id])->assertConflict();
        $this->assertDatabaseHas('membership_licenses', ['id' => $created['id'], 'redeemed_at' => null]);
    }
    public function test_real_csrf_and_future_step_up_are_rejected(): void
    {
        $this->unlock();
        $this->withSession(['owner_second_factor_verified_at' => now()->addMinute()->timestamp])
            ->getJson('/web-api/owner/licenses')->assertStatus(428);
        $this->withSession(['owner_second_factor_verified_at' => now()->timestamp]);
        // Run the actual framework CSRF middleware without its test-only bypass.
        $this->app->instance('env', 'local');
        $this->postJson('/web-api/owner/licenses', $this->terms())->assertStatus(419);
        $this->postJson('/web-api/account/license', ['licenseKey' => Keys::generate(), 'expectedAccountId' => $this->owner->id])->assertStatus(419);
        $this->assertDatabaseCount('membership_licenses', 0);
    }

}
