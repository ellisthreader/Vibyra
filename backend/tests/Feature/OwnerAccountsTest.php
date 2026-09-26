<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Auth\Totp;
use App\Services\Auth\TwoFactor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OwnerAccountsTest extends TestCase
{
    use RefreshDatabase;

    public function test_named_accounts_require_an_owner_and_recent_second_factor(): void
    {
        config(['owner_analytics.emails' => ['owner@example.test']]);
        $member = User::factory()->create(['name' => 'Real Member', 'email' => 'member@example.test']);
        VibyraSession::create([
            'user_id' => $member->id,
            'token_hash' => hash('sha256', 'member-token'),
            'last_used_at' => now(),
        ]);
        DB::table('auth_login_events')->insert([
            'user_id' => $member->id, 'channel' => 'app',
            'method' => 'password', 'created_at' => now(),
        ]);
        $this->getJson('/web-api/owner/accounts')->assertUnauthorized();
        $this->actingAs($member)->getJson('/web-api/owner/accounts')->assertForbidden();

        $owner = User::factory()->create(['email' => 'owner@example.test']);
        $this->actingAs($owner)->getJson('/web-api/owner/accounts')
            ->assertStatus(428)->assertJsonPath('enabled', false);
        $this->postJson('/web-api/owner/verify-2fa', ['code' => '123456'])->assertForbidden();

        $twoFactor = app(TwoFactor::class);
        $totp = app(Totp::class);
        $secret = $twoFactor->start($owner);
        $key = $totp->decode($secret);
        $slot = intdiv(time(), Totp::PERIOD);
        $this->assertNotNull($twoFactor->confirm($owner, $totp->at($key, $slot)));
        $this->getJson('/web-api/owner/accounts')->assertStatus(428)->assertJsonPath('enabled', true);
        $this->postJson('/web-api/owner/verify-2fa', ['code' => '000000'])->assertUnprocessable();
        $this->postJson('/web-api/owner/verify-2fa', ['code' => $totp->at($key, $slot + 1)])
            ->assertOk()->assertJsonPath('ok', true);
        $this->getJson('/web-api/owner/accounts?page=1')->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('accounts.0.email', 'owner@example.test');
        $this->getJson('/web-api/owner/accounts?page=1')->assertJsonPath('accounts.1.logins_30d', 1);
        $this->getJson('/web-api/owner/accounts?page=0')->assertUnprocessable();

        $this->travel(11)->minutes();
        $this->getJson('/web-api/owner/accounts')->assertStatus(428);
    }
}
