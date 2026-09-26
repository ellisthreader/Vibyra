<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB, Http, Queue, RateLimiter};
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Trying Vibes with no account, and keeping what is left of them when one is made.
 *
 * The rule these tests exist for is the one that is easy to get wrong and
 * expensive when it is: a guest who spends the trial and then signs up must not be
 * handed a second one. It holds here because signing up converts the guest row
 * rather than creating an account beside it, so there is no balance to move.
 */
class VibesGuestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'vibes.guests_enabled' => true,
            'services.openrouter.key' => 'test-only',
            'app.key' => 'base64:'.base64_encode(str_repeat('x', 32))]);
        Cache::put((string) config('billing.openrouter_pricing.cache_key'), ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'],
                'supported_parameters' => ['tools', 'max_tokens']],
        ]]);
        Queue::fake();
        RateLimiter::clear('vibes-guest:'.hash('sha256', '127.0.0.1'));
    }

    /** A guest session token, and the wallet it was handed. */
    private function guest(string $install = 'install-a'): array
    {
        $response = $this->postJson('/api/vibes/guest', ['installId' => $install])->assertOk();
        return [$response->json('token'), $response->json('wallet'), $response->json('user.id')];
    }

    public function test_a_guest_starts_on_the_same_trial_an_account_gets(): void
    {
        [$token, $wallet, $id] = $this->guest();
        $this->assertSame(config('vibes.trial_credits'), $wallet['available']);
        $this->assertTrue($wallet['guest']);
        $this->assertFalse($wallet['purchasesEnabled'], 'a purchase needs somewhere to live if the phone is lost');
        $this->withToken($token)->getJson('/api/vibes/wallet')->assertOk()
            ->assertJsonPath('wallet.available', config('vibes.trial_credits'));
        $this->assertNotNull(User::findOrFail($id)->guest_at);
    }

    public function test_a_guest_reaches_vibes_and_nothing_else(): void
    {
        [$token] = $this->guest();
        // Vibes is the one area a guest is for.
        $this->withToken($token)->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $this->withToken($token)->getJson('/api/vibes/models')->assertOk();
        // Everything else refuses the session outright.
        $this->withToken($token)->getJson('/api/session')->assertStatus(403);
        $this->withToken($token)->postJson('/api/vibes/purchases',
            ['transactionId' => '1', 'productId' => 'app.vibyra.vibes.pro.monthly'])->assertStatus(403);
    }

    public function test_a_guest_may_spend_without_an_email_it_could_never_verify(): void
    {
        [$token] = $this->guest();
        $this->withToken($token)->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $chat = (string) Str::uuid();
        $this->withToken($token)->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Build a timer'])->assertOk();
        $this->withToken($token)->postJson('/api/vibes/quote',
            ['chatId' => $chat, 'text' => 'Build a timer', 'model' => 'auto'])->assertOk();
    }

    public function test_signing_up_keeps_the_guest_balance_and_grants_nothing_further(): void
    {
        [$token, , $id] = $this->guest();
        // Part of the trial, not a fixed number: `trial_credits` is a price and it
        // moves, and what this test is about is the remainder surviving signup.
        $spent = 1;
        $this->spend($token, $id, $spent);

        $this->withToken($token)->postJson('/api/auth/signup',
            ['email' => 'ellis@example.com', 'password' => 'a-good-password'])->assertStatus(201);

        // The same row, now an account: not a second one beside it.
        $user = User::findOrFail($id);
        $this->assertNull($user->guest_at);
        $this->assertSame('ellis@example.com', $user->email);
        $this->assertSame(1, User::where('email', 'ellis@example.com')->count());
        $this->assertSame((int) config('vibes.trial_credits') - $spent,
            app(\App\Services\Vibes\Wallet::class)->available($id), 'the balance carried, untouched');
        $this->assertSame(1, DB::table('vibes_grants')->where('user_id', $id)->count(), 'no second welcome grant');
    }

    public function test_a_guest_who_spends_everything_signs_up_with_nothing(): void
    {
        // The reported requirement, exactly: continue as a guest, use the lot, make
        // a free account, and the balance is still nothing.
        [$token, , $id] = $this->guest();
        $this->spend($token, $id, (int) config('vibes.trial_credits'));
        $this->assertSame(0, app(\App\Services\Vibes\Wallet::class)->available($id));

        $this->withToken($token)->postJson('/api/auth/signup',
            ['email' => 'empty@example.com', 'password' => 'a-good-password'])->assertStatus(201);

        $this->assertSame(0, app(\App\Services\Vibes\Wallet::class)->available($id));
        $this->withToken($token)->getJson('/api/vibes/wallet')->assertOk()->assertJsonPath('wallet.available', 0);
    }

    public function test_signing_up_without_ever_being_a_guest_still_gets_the_trial(): void
    {
        $this->postJson('/api/auth/signup', ['email' => 'fresh@example.com', 'password' => 'a-good-password'])
            ->assertStatus(201);
        $user = User::where('email', 'fresh@example.com')->firstOrFail();
        $this->assertNull($user->guest_at);
        app(\App\Services\Vibes\Wallet::class)->ensure($user);
        $this->assertSame((int) config('vibes.trial_credits'), app(\App\Services\Vibes\Wallet::class)->available($user->id));
    }

    public function test_a_device_that_has_had_its_trial_gets_a_guest_with_nothing(): void
    {
        [, $first] = $this->guest('install-a');
        $this->assertSame(config('vibes.trial_credits'), $first['available']);
        // Same install asking again is the reinstall case the local half catches.
        [, $second] = $this->guest('install-a');
        $this->assertSame(0, $second['available'], 'a second trial is not granted to the same install');
        // It is still a working guest, so the app has somewhere to land.
        $this->assertTrue($second['guest']);
    }

    public function test_apple_decides_when_the_install_id_is_new(): void
    {
        // A reinstall produces a fresh install id, so the local table says nothing
        // and DeviceCheck is the control that answers.
        config(['vibes.devicecheck_key_id' => 'KEY', 'vibes.devicecheck_team_id' => 'TEAM',
            'vibes.devicecheck_private_key' => $this->signingKey()]);
        Http::fake(['*devicecheck*' => Http::response(['bit0' => true, 'bit1' => false])]);
        $response = $this->postJson('/api/vibes/guest', ['installId' => 'reinstalled', 'deviceToken' => 'AAAA'])->assertOk();
        $this->assertSame(0, $response->json('wallet.available'), 'Apple remembers the device the app forgot');
    }

    public function test_an_unreachable_devicecheck_grants_nothing_rather_than_guessing(): void
    {
        config(['vibes.devicecheck_key_id' => 'KEY', 'vibes.devicecheck_team_id' => 'TEAM',
            'vibes.devicecheck_private_key' => $this->signingKey()]);
        Http::fake(['*devicecheck*' => Http::response('', 500)]);
        $response = $this->postJson('/api/vibes/guest', ['installId' => 'new-install', 'deviceToken' => 'AAAA'])->assertOk();
        $this->assertSame(0, $response->json('wallet.available'),
            'an outage costs a trial; the other way round costs money for as long as nobody looks');
    }

    public function test_a_guest_cannot_be_signed_up_twice(): void
    {
        [$token, , $id] = $this->guest();
        $this->withToken($token)->postJson('/api/auth/signup',
            ['email' => 'one@example.com', 'password' => 'a-good-password'])->assertStatus(201);
        // The old guest token still authenticates the account it became, so a
        // replayed signup must be refused rather than making a second account.
        $this->withToken($token)->postJson('/api/auth/signup',
            ['email' => 'two@example.com', 'password' => 'a-good-password'])->assertStatus(403);
        $this->assertSame(0, User::where('email', 'two@example.com')->count());
        $this->assertNull(User::findOrFail($id)->guest_at);
    }

    public function test_signing_up_onto_a_taken_address_leaves_the_guest_alone(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);
        [$token, , $id] = $this->guest();
        $this->withToken($token)->postJson('/api/auth/signup',
            ['email' => 'taken@example.com', 'password' => 'a-good-password'])->assertStatus(409);
        // Still a guest, still holding its Vibes, free to try another address.
        $this->assertNotNull(User::findOrFail($id)->guest_at);
        $this->assertSame((int) config('vibes.trial_credits'), app(\App\Services\Vibes\Wallet::class)->available($id));
    }

    public function test_guests_are_off_unless_switched_on(): void
    {
        config(['vibes.guests_enabled' => false]);
        $this->postJson('/api/vibes/guest', ['installId' => 'x'])->assertStatus(503);
    }

    public function test_one_network_cannot_mint_guests_without_end(): void
    {
        for ($i = 0; $i < 5; $i++) $this->postJson('/api/vibes/guest', ['installId' => 'i'.$i])->assertOk();
        $this->postJson('/api/vibes/guest', ['installId' => 'i6'])->assertStatus(429);
    }

    /** Spends `$amount` Vibes by settling a turn against them. */
    private function spend(string $token, int $id, int $amount): void
    {
        $chat = (string) Str::uuid();
        $this->withToken($token)->postJson('/api/vibes/consent', ['accepted' => true])->assertOk();
        $this->withToken($token)->postJson('/api/vibes/chats', ['id' => $chat, 'title' => 'Spending'])->assertOk();
        // Charged directly rather than through a provider round trip: what these
        // tests are about is the balance surviving signup, not how it was reduced.
        DB::transaction(function () use ($id, $amount) {
            $wallet = app(\App\Services\Vibes\Wallet::class);
            $wallet->lock($id);
            $grant = DB::table('vibes_grants')->where('user_id', $id)->first();
            DB::table('vibes_grants')->where('id', $grant->id)->update(['remaining' => $grant->remaining - $amount]);
            $wallet->record($id, 'test-spend:'.$id.':'.$amount, 'spend', -$amount);
        });
    }

    /** A throwaway EC key, so DeviceCheck's JWT can be signed in a test. */
    private function signingKey(): string
    {
        $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        openssl_pkey_export($key, $pem);
        return $pem;
    }
}
