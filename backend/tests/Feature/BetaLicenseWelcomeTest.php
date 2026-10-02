<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use App\Services\Membership\Licenses\{Allowance, Issuance, Keys, Redemption};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class BetaLicenseWelcomeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 2)->setTime(12, 0));
        config(['licenses.enabled' => true, 'membership.enabled' => true,
            'membership.new_accounts_from' => now()->subYear()->toIso8601String(),
            'membership.free_enabled' => false, 'human_check.enabled' => false]);
    }

    private function issue(array $terms = []): array
    {
        return app(Issuance::class)->create(User::factory()->create(), [...[
            'request_id' => (string) Str::uuid(), 'label' => 'Beta recipient', 'tokens' => 300,
            'allowance' => 'monthly', 'duration_months' => 3, 'fixed_ends_at' => null,
            'claim_by' => now()->addWeek()->format('Y-m-d H:i:s'),
        ], ...$terms]);
    }

    private function recipient(array $terms = []): array
    {
        $user = User::factory()->create();
        $license = $this->issue($terms);
        app(Redemption::class)->redeem($user, Keys::hash($license['key']));
        return [$user, $license['id']];
    }

    private function token(User $user, array $attributes = []): string
    {
        $token = Str::random(72);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token),
            'device_name' => 'Beta test', ...$attributes]);
        return $token;
    }

    private function accounting(): array
    {
        return collect(['vibes_wallets', 'vibes_grants', 'vibes_ledger', 'membership_periods',
            'membership_license_audits'])->mapWithKeys(fn ($table) => [$table => DB::table($table)->get()->toJson()])->all();
    }

    public function test_profile_metadata_and_acknowledgment_are_shared_between_sessions(): void
    {
        [$user, $id] = $this->recipient();
        $first = $this->token($user); $second = $this->token($user);
        $this->withToken($first)->getJson('/api/session')->assertOk()
            ->assertJsonPath('user.license.betaWelcome', ['id' => $id, 'months' => 3]);
        $this->withToken($first)->postJson('/api/account/license/welcome', ['welcomeId' => $id])
            ->assertOk()->assertExactJson(['ok' => true]);
        $this->assertNotNull(DB::table('membership_licenses')->where('id', $id)->value('beta_welcome_seen_at'));
        $this->withToken($second)->getJson('/api/session')->assertOk()->assertJsonPath('user.license.betaWelcome', null);
    }

    public function test_ack_is_idempotent_and_cannot_refresh_due_allowances_or_change_accounting(): void
    {
        [$user, $id] = $this->recipient();
        $this->travel(35)->days(); // A profile refresh would grant the next monthly allowance.
        $this->withToken($this->token($user));
        config(['licenses.enabled' => false]);
        $before = $this->accounting();
        $license = (array) DB::table('membership_licenses')->where('id', $id)->first();
        $this->postJson('/api/account/license/welcome', ['welcomeId' => $id])->assertOk();
        $seen = DB::table('membership_licenses')->where('id', $id)->value('beta_welcome_seen_at');
        $this->assertNotNull($seen);
        $this->travel(1)->minute();
        $this->postJson('/api/account/license/welcome', ['welcomeId' => $id])->assertOk();
        $after = (array) DB::table('membership_licenses')->where('id', $id)->first();
        $this->assertSame($seen, $after['beta_welcome_seen_at']);
        $after['beta_welcome_seen_at'] = null;
        $this->assertSame($license, $after);
        $this->assertSame($before, $this->accounting());
    }

    public function test_missing_malformed_unknown_and_other_account_ids_cannot_be_acknowledged(): void
    {
        [$user, $id] = $this->recipient();
        [, $otherId] = $this->recipient();
        $this->withToken($this->token($user));
        $this->postJson('/api/account/license/welcome', [])->assertUnprocessable();
        $this->postJson('/api/account/license/welcome', ['welcomeId' => 'not-a-uuid'])->assertUnprocessable();
        foreach ([(string) Str::uuid(), $otherId] as $invalid) {
            $this->postJson('/api/account/license/welcome', ['welcomeId' => $invalid])->assertNotFound();
        }
        $this->assertSame(0, DB::table('membership_licenses')->whereNotNull('beta_welcome_seen_at')->count());
    }

    public function test_cookie_authentication_and_invalid_bearer_sessions_are_insufficient(): void
    {
        [$user, $id] = $this->recipient();
        $this->actingAs($user)->postJson('/api/account/license/welcome', ['welcomeId' => $id])->assertUnauthorized();
        foreach ([['revoked_at' => now()], ['absolute_expires_at' => now()->subMinute()],
            ['idle_expires_at' => now()->subMinute()]] as $attributes) {
            $this->withToken($this->token($user, $attributes))
                ->postJson('/api/account/license/welcome', ['welcomeId' => $id])->assertUnauthorized();
        }
        $this->assertDatabaseHas('membership_licenses', ['id' => $id, 'beta_welcome_seen_at' => null]);
    }

    public function test_unverified_and_guest_accounts_cannot_acknowledge(): void
    {
        foreach ([['email_verified_at' => null], ['guest_at' => now()]] as $attributes) {
            [$user, $id] = $this->recipient();
            $user->forceFill($attributes)->save();
            $this->withToken($this->token($user))->postJson('/api/account/license/welcome', ['welcomeId' => $id])->assertForbidden();
            if (!$user->isGuest()) {
                $this->getJson('/api/session')->assertOk()->assertJsonPath('user.license.betaWelcome', null);
            } else {
                $this->getJson('/api/session')->assertForbidden();
            }
            $this->assertDatabaseHas('membership_licenses', ['id' => $id, 'beta_welcome_seen_at' => null]);
        }
    }

    public function test_expired_revoked_opted_out_and_unredeemed_licenses_cannot_acknowledge(): void
    {
        foreach ([['ends_at' => now()], ['revoked_at' => now()], ['beta_welcome' => false], ['redeemed_at' => null]] as $change) {
            [$user, $id] = $this->recipient();
            DB::table('membership_licenses')->where('id', $id)->update($change);
            $this->withToken($this->token($user))->postJson('/api/account/license/welcome', ['welcomeId' => $id])->assertNotFound();
            $this->assertNull(app(Allowance::class)->summary($user->id)['betaWelcome'] ?? null);
            $this->assertDatabaseHas('membership_licenses', ['id' => $id, 'beta_welcome_seen_at' => null]);
        }
    }

    public function test_fixed_date_license_uses_null_months_and_owner_opt_out_survives_issuance(): void
    {
        [$user, $id] = $this->recipient(['duration_months' => null, 'fixed_ends_at' => now()->addMonths(2)->format('Y-m-d H:i:s')]);
        $this->withToken($this->token($user))->getJson('/api/session')->assertOk()
            ->assertJsonPath('user.license.betaWelcome', ['id' => $id, 'months' => null]);
        [$optOut, $optOutId] = $this->recipient(['beta_welcome' => false]);
        $this->withToken($this->token($optOut))->getJson('/api/session')->assertOk()->assertJsonPath('user.license.betaWelcome', null);
        $this->assertDatabaseHas('membership_licenses', ['id' => $optOutId, 'beta_welcome' => false]);
    }
}
