<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OwnerAccountDirectoryTest extends TestCase
{
    use RefreshDatabase, Concerns\OwnerAccountFixtures;

    protected function setUp(): void { parent::setUp(); $this->accounts(); }

    public function test_every_read_and_write_requires_web_owner_and_fresh_second_factor(): void
    {
        $url = $this->accountUrl(); $terms = $this->action();
        foreach (['/web-api/owner/accounts', $url, $url.'/actions/'.$terms['request_id']] as $path) {
            $this->getJson($path)->assertUnauthorized();
        }
        VibyraSession::create(['user_id' => $this->owner->id, 'token_hash' => hash('sha256', 'owner-token')]);
        $this->withToken('owner-token')->postJson($url.'/actions', $terms)->assertUnauthorized();
        $this->actingAs($this->target)->getJson($url)->assertForbidden();
        $this->postJson($url.'/actions', $terms)->assertForbidden();
        $this->actingAs($this->owner)->getJson($url)->assertStatus(428);
        $this->postJson($url.'/actions', $terms)->assertStatus(428);
        $this->unlockOwner();
        $this->getJson($url)->assertOk()->assertJsonPath('ownerAccessExpiresAt', (now()->timestamp + 600) * 1000);
        foreach ([now()->addMinute()->timestamp, now()->subMinutes(11)->timestamp] as $invalid) {
            $this->withSession(['owner_second_factor_verified_at' => $invalid]);
            $this->getJson('/web-api/owner/accounts?search=jordan')->assertStatus(428);
            $this->postJson($url.'/actions', $terms)->assertStatus(428);
            $this->postJson($url.'/actions/'.$terms['request_id'].'/cancel')->assertStatus(428);
        }
        $this->assertDatabaseCount('owner_account_actions', 0);
    }

    public function test_search_covers_all_pages_case_insensitively_and_treats_wildcards_literally(): void
    {
        $this->target->forceFill(['created_at' => now()->subYear(), 'name' => 'Literal%_match'])->save();
        User::factory()->count(30)->create(); $this->unlockOwner();
        $this->getJson('/web-api/owner/accounts?search=JORDAN')->assertOk()->assertJsonPath('total', 1)
            ->assertJsonPath('accounts.0.id', $this->target->id);
        $this->getJson('/web-api/owner/accounts?search=%25_')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/web-api/owner/accounts?search='.$this->target->id)->assertJsonPath('accounts.0.id', $this->target->id);
        $this->getJson('/web-api/owner/accounts?search=missing%40example.test')->assertJsonPath('total', 0);
        $this->getJson('/web-api/owner/accounts?search[]=bad')->assertUnprocessable();
        $this->getJson('/web-api/owner/accounts?page=0')->assertUnprocessable();
    }

    public function test_profile_read_has_no_billing_side_effects_or_secrets(): void
    {
        config(['membership.enabled' => true, 'membership.new_accounts_from' => now()->subMinute()->toIso8601String()]);
        $this->unlockOwner();
        $response = $this->getJson($this->accountUrl())->assertOk()->assertJsonPath('balances', []);
        $this->assertDatabaseMissing('vibes_wallets', ['user_id' => $this->target->id]);
        foreach (['vibes_grants', 'membership_periods', 'owner_account_actions'] as $table) $this->assertDatabaseCount($table, 0);
        foreach (['password', 'two_factor_secret', 'account_token', 'stripe_customer_id'] as $key) {
            $this->assertStringNotContainsString('"'.$key.'"', $response->getContent());
        }
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
    }

    public function test_real_csrf_and_protected_owner_accounts_are_enforced(): void
    {
        $this->unlockOwner();
        $this->postJson($this->accountUrl($this->owner->id).'/actions', $this->action())->assertForbidden();
        $other = User::factory()->create(['email' => 'second-owner@example.test']);
        config(['owner_analytics.emails' => [$this->owner->email, $other->email]]);
        $this->postJson($this->accountUrl($other->id).'/actions', $this->action(['action' => 'ban']))->assertForbidden();
        $this->app->instance('env', 'local');
        $this->postJson($this->accountUrl().'/actions', $this->action())->assertStatus(419);
        $this->postJson($this->accountUrl().'/actions/'.$this->action()['request_id'].'/cancel')->assertStatus(419);
        $this->assertDatabaseCount('owner_account_actions', 0);
    }

    public function test_a_stale_owner_tab_cannot_read_write_or_cancel_as_the_new_owner(): void
    {
        $oldOwner = $this->owner->id;
        $this->owner = User::factory()->create(['email' => 'next-owner@example.test']);
        config(['owner_analytics.emails' => ['owner@example.test', $this->owner->email]]);
        $this->unlockOwner();
        $this->withHeader('X-Owner-Account', (string) $oldOwner);
        $terms = $this->action(); $url = $this->accountUrl();
        $this->getJson($url)->assertForbidden();
        $this->postJson($url.'/actions', $terms)->assertForbidden();
        $this->postJson($url.'/actions/'.$terms['request_id'].'/cancel')->assertForbidden();
        $this->assertDatabaseCount('owner_account_actions', 0);
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
        $this->withHeader('X-Owner-Account', (string) $this->owner->id);
        $this->postJson($url.'/actions', $terms)->assertOk()->assertJsonPath('ownerAccountId', $this->owner->id)
            ->assertJsonPath('receipt.actor_id', $this->owner->id);
    }
}
