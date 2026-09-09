<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Vibes\{Catalog, Plans, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class VibesEntitlementsTest extends TestCase
{
    use RefreshDatabase;

    private string $token = 'vibes-entitlement-session';

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        Cache::put('billing:openrouter-pricing:v1', ['synced_at' => now()->toIso8601String(), 'models' => [
            'qwen/qwen3.8-flash' => ['slug' => 'qwen/qwen3.8-flash', 'name' => 'Qwen: Qwen3.8 Flash',
                'pricing' => ['prompt' => '0.00000015', 'completion' => '0.00000047'], 'supported_parameters' => ['tools']],
            'someone/uncurated-model' => ['slug' => 'someone/uncurated-model', 'name' => 'Someone: Uncurated Model',
                'pricing' => ['prompt' => '0.0000002', 'completion' => '0.0000006'], 'supported_parameters' => ['tools']],
        ]]);
    }

    private function account(string $plan = 'free'): User
    {
        $user = User::factory()->create(['email_verified_at' => now()]);
        app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update([
            'consented_at' => now(), 'plan' => $plan,
            'paid_until' => $plan === 'free' ? null : now()->addMonth(),
        ]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $this->token), 'device_name' => 'iPhone']);
        return $user;
    }

    private function attach(User $user, string $project, ?string $chat = null): \Illuminate\Testing\TestResponse
    {
        $chat ??= (string) Str::uuid();
        DB::table('vibes_chats')->insertOrIgnore(['id' => $chat, 'user_id' => $user->id,
            'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
        return $this->withToken($this->token)->postJson('/api/vibes/chats/'.$chat.'/project', [
            'hostId' => 'host-one', 'projectId' => $project, 'binding' => (string) Str::uuid(), 'shareProject' => true,
        ]);
    }

    public function test_an_unknown_plan_falls_back_to_the_floor_rather_than_the_widest_offer(): void
    {
        $this->assertSame(
            ['maxProjects' => 1, 'concurrentReplies' => 1, 'fullCatalogue' => false, 'remoteAccess' => false],
            app(Plans::class)->for('enterprise-does-not-exist')
        );
        $this->assertNull(app(Plans::class)->for('pro')['maxProjects']);
    }

    public function test_the_project_limit_counts_distinct_projects_and_allows_moving_a_chat(): void
    {
        $user = $this->account();
        $first = (string) Str::uuid();
        $this->attach($user, 'project-a', $first)->assertOk();
        // A second distinct project crosses the Free plan's single-project limit.
        $this->attach($user, 'project-b')->assertStatus(402);
        // Moving the same chat to another project keeps the account at one project.
        $this->attach($user, 'project-b', $first)->assertOk();
        $this->assertSame(1, app(Wallet::class)->projectCount($user->id));
    }

    public function test_a_higher_plan_raises_the_project_limit(): void
    {
        $user = $this->account('builder');
        foreach (['a', 'b', 'c', 'd'] as $project) $this->attach($user, 'project-'.$project)->assertOk();
        $this->assertSame(4, app(Wallet::class)->projectCount($user->id));
        $this->assertSame(10, app(Wallet::class)->payload($user->id)['entitlements']['maxProjects']);
    }

    public function test_only_a_full_catalogue_plan_reaches_models_outside_the_curated_list(): void
    {
        $catalog = app(Catalog::class);
        $curated = collect($catalog->models('free'))->pluck('id');
        $this->assertFalse($curated->contains('someone/uncurated-model'));

        $full = collect($catalog->models('pro'))->pluck('id');
        $this->assertTrue($full->contains('someone/uncurated-model'));
        $this->assertTrue($full->contains('qwen/qwen3.8-flash'), 'Curated models stay in the full catalogue.');

        // Catalogue models are never trial-funded, so trial credit cannot buy them.
        $resolved = collect($catalog->models('pro'))->firstWhere('id', 'someone/uncurated-model');
        $this->assertFalse($resolved['trial']);
        $this->assertSame('Uncurated Model', $resolved['name']);

        $this->expectException(HttpException::class);
        $catalog->resolve('someone/uncurated-model', 'builder');
    }

    public function test_a_full_catalogue_plan_can_quote_an_uncurated_model(): void
    {
        $this->assertSame('someone/uncurated-model', app(Catalog::class)->resolve('someone/uncurated-model', 'pro')['id']);
    }

    public function test_concurrent_replies_follow_the_plan_and_expire_with_it(): void
    {
        $user = $this->account('pro');
        $this->assertSame(3, app(Plans::class)->for('pro')['concurrentReplies']);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['paid_until' => now()->subDay()]);
        // An expired paid period is entitled as Free, so the second reply is refused.
        $payload = app(Wallet::class)->payload($user->id);
        $this->assertSame('free', $payload['plan']);
        $this->assertSame(1, $payload['entitlements']['concurrentReplies']);
    }

    public function test_the_wallet_publishes_every_plan_offer_and_the_remote_rollout_state(): void
    {
        $payload = app(Wallet::class)->payload($this->account()->id);
        $this->assertSame(['free', 'starter', 'builder', 'pro'], array_keys($payload['planEntitlements']));
        $this->assertTrue($payload['planEntitlements']['pro']['fullCatalogue']);
        $this->assertTrue($payload['planEntitlements']['pro']['remoteAccess']);
        // Remote access is sold as included, but is not live until a relay ships.
        $this->assertFalse($payload['remoteAccessLive']);
        $this->assertContains('app.vibyra.vibes.pro.monthly', collect($payload['products'])->pluck('id')->all());
    }

    public function test_a_paid_plan_grants_its_product_credits_and_entitlements(): void
    {
        $user = $this->account('pro');
        $this->assertSame('pro', app(Wallet::class)->planFor($user->id));
        $entitlements = app(Wallet::class)->payload($user->id)['entitlements'];
        $this->assertNull($entitlements['maxProjects']);
        $this->assertTrue($entitlements['fullCatalogue']);
    }
}
