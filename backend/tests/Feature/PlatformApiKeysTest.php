<?php

namespace Tests\Feature;

use App\Models\{AccountAuditEvent, ApiKey, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, RateLimiter};
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** Roadmap Part 11: personal API keys (hashed, shown once, scoped, rate limited, revocable) and what they can never do. */
class PlatformApiKeysTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        config(['platform.api_keys' => true, 'platform.activity' => true]);
        $this->actingAs($this->user);
    }

    /** Create a key in the portal (browser session); the secret comes back once. */
    private function makeKey(array $scopes = ['runs:read'], array $extra = []): array
    {
        $r = $this->withToken('')->postJson('/web-api/developer/keys', ['name' => 'CI', 'scopes' => $scopes, ...$extra])->assertCreated();
        return [$r->json('key'), $r->json('secret')];
    }

    private function asKey(string $secret)
    {
        $this->app['auth']->forgetGuards();
        return $this->withToken($secret);
    }

    public function test_the_secret_is_shown_once_and_only_its_hash_is_stored(): void
    {
        [$key, $secret] = $this->makeKey(['runs:read', 'projects:read']);
        $this->assertMatchesRegularExpression('/^vyk_[A-Za-z0-9]{40}$/', $secret);
        $row = DB::table('api_keys')->where('id', $key['id'])->first();
        $this->assertSame(hash('sha256', $secret), $row->key_hash);
        $this->assertStringNotContainsString($secret, json_encode((array) $row));
        $this->assertStringStartsWith($row->prefix, $secret);
        foreach (['/web-api/developer', '/web-api/developer/keys'] as $path) {
            $body = $this->withToken('')->getJson('/web-api/developer')->assertOk()->getContent();
            $this->assertStringNotContainsString($secret, $body);
            $this->assertStringNotContainsString('key_hash', $body);
        }
        $this->assertSame(['api_key.created'], AccountAuditEvent::pluck('event')->all());
        $this->assertStringNotContainsString($secret, json_encode(AccountAuditEvent::first()->detail));
    }

    public function test_a_key_reads_only_inside_its_scopes_and_its_own_account(): void
    {
        [, $secret] = $this->makeKey(['runs:read']);
        $this->withToken('v2-session');
        $run = $this->admit();
        $mine = $this->asKey($secret);
        $mine->getJson('/api/platform/v1/runs')->assertOk()->assertJsonPath('runs.0.id', $run['id'])->assertJsonMissingPath('runs.0.actions.0.fingerprint');
        $mine->getJson('/api/platform/v1/runs/'.$run['id'])->assertOk()->assertJsonPath('run.state', 'queued');
        $mine->getJson('/api/platform/v1/projects')->assertForbidden()->assertJsonPath('code', 'insufficient_scope');
        $mine->postJson('/api/platform/v1/runs', ['prompt' => 'Do it'])->assertForbidden()->assertJsonPath('code', 'insufficient_scope');
        $stranger = User::factory()->create();
        DB::table('agent_runs')->where('id', $run['id'])->update(['user_id' => $stranger->id]);
        $mine->getJson('/api/platform/v1/runs/'.$run['id'])->assertNotFound();
        $mine->getJson('/api/platform/v1/runs')->assertOk()->assertJsonCount(0, 'runs');
    }

    public function test_a_key_with_runs_create_starts_a_run_once_per_idempotency_key(): void
    {
        [, $secret] = $this->makeKey(['runs:create']);
        $key = $this->asKey($secret);
        $a = $key->postJson('/api/platform/v1/runs', ['prompt' => 'Summarise the repo.', 'agentId' => $this->agent['id']], ['Idempotency-Key' => 'ci-run-0001'])->assertCreated();
        $b = $key->postJson('/api/platform/v1/runs', ['prompt' => 'Summarise the repo.', 'agentId' => $this->agent['id']], ['Idempotency-Key' => 'ci-run-0001'])->assertOk();
        $this->assertSame($a->json('run.id'), $b->json('run.id'));
        $this->assertTrue($b->json('replayed'));
        $key->postJson('/api/platform/v1/runs', ['prompt' => 'A different task.'], ['Idempotency-Key' => 'ci-run-0001'])->assertStatus(409);
        $key->postJson('/api/platform/v1/runs', ['prompt' => 'No agent named uses the latest teammate.'])->assertCreated()->assertJsonPath('run.agentId', $this->agent['id']);
        $this->assertSame(2, DB::table('agent_runs')->count());
    }

    public function test_a_wrong_missing_or_revoked_key_is_refused_and_revocation_is_immediate(): void
    {
        [$key, $secret] = $this->makeKey();
        $this->asKey($secret)->getJson('/api/platform/v1/runs')->assertOk();
        $this->asKey('vyk_'.str_repeat('a', 40))->getJson('/api/platform/v1/runs')->assertUnauthorized()->assertJsonPath('code', 'invalid_api_key');
        $this->asKey('v2-session')->getJson('/api/platform/v1/runs')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withToken('')->getJson('/api/platform/v1/runs')->assertUnauthorized();
        $this->actingAs($this->user)->withToken('')->deleteJson('/web-api/developer/keys/'.$key['id'])->assertOk()->assertJsonPath('key.revokedAt', fn ($v) => $v !== null);
        $this->asKey($secret)->getJson('/api/platform/v1/runs')->assertUnauthorized();
        $this->assertSame(['api_key.created', 'api_key.revoked'], AccountAuditEvent::orderBy('id')->pluck('event')->all());
    }

    public function test_each_key_has_its_own_per_minute_budget(): void
    {
        RateLimiter::clear('x');
        [, $slow] = $this->makeKey(['runs:read'], ['ratePerMinute' => 3]);
        [, $other] = $this->makeKey(['runs:read']);
        for ($i = 0; $i < 3; $i++) $this->asKey($slow)->getJson('/api/platform/v1/runs')->assertOk();
        $this->asKey($slow)->getJson('/api/platform/v1/runs')->assertStatus(429)->assertJsonPath('code', 'rate_limited')->assertHeader('Retry-After');
        $this->asKey($other)->getJson('/api/platform/v1/runs')->assertOk();
        $this->travel(61)->seconds();
        $this->asKey($slow)->getJson('/api/platform/v1/runs')->assertOk();
    }

    public function test_last_used_is_recorded_without_a_write_on_every_call(): void
    {
        [$key, $secret] = $this->makeKey();
        $this->assertNull(ApiKey::find($key['id'])->last_used_at);
        $this->asKey($secret)->getJson('/api/platform/v1/runs')->assertOk();
        $first = ApiKey::find($key['id'])->last_used_at;
        $this->assertNotNull($first);
        $this->travel(10)->seconds();
        $this->asKey($secret)->getJson('/api/platform/v1/runs')->assertOk();
        $this->assertEquals($first, ApiKey::find($key['id'])->last_used_at);
        $this->travel(2)->minutes();
        $this->asKey($secret)->getJson('/api/platform/v1/runs')->assertOk();
        $this->assertTrue(ApiKey::find($key['id'])->last_used_at->gt($first));
    }

    public function test_a_key_can_never_approve_change_billing_or_manage_keys(): void
    {
        [, $secret] = $this->makeKey(['runs:read', 'runs:create', 'triggers:invoke', 'projects:read']);
        $key = $this->asKey($secret);
        $action = '11111111-1111-4111-8111-111111111111';
        $key->postJson('/api/agents/v2/actions/'.$action.'/decision', ['fingerprint' => str_repeat('a', 64), 'decision' => 'allow'])->assertStatus(401);
        $key->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'key-sneaks-1', 'prompt' => 'x'])->assertStatus(401);
        $key->postJson('/api/billing/checkout', [])->assertStatus(401);
        foreach (['cancel', 'change', 'portal'] as $path) $key->postJson('/api/billing/'.$path, [])->assertStatus(401);
        $key->postJson('/web-api/developer/keys', ['name' => 'more', 'scopes' => ['runs:read']])->assertStatus(401);
        $key->getJson('/web-api/developer')->assertStatus(401);
        $key->getJson('/api/account/activity')->assertStatus(401);
        $this->assertSame(0, DB::table('agent_tool_actions')->count());
        $this->assertSame(1, ApiKey::count());
        // And no scope exists that could ask for those things.
        $this->actingAs($this->user)->withToken('')->postJson('/web-api/developer/keys', ['name' => 'x', 'scopes' => ['approvals:write']])->assertStatus(422);
        $this->postJson('/web-api/developer/keys', ['name' => 'x', 'scopes' => ['keys:manage']])->assertStatus(422);
    }

    public function test_the_portal_refuses_a_guest_a_signed_out_browser_and_too_many_keys(): void
    {
        config(['platform.max_keys' => 2]);
        $this->makeKey(); $this->makeKey();
        $this->withToken('')->postJson('/web-api/developer/keys', ['name' => 'third', 'scopes' => ['runs:read']])->assertStatus(409)->assertJsonPath('code', 'key_limit');
        $this->app['auth']->forgetGuards();
        $this->withToken('')->postJson('/web-api/developer/keys', ['name' => 'x', 'scopes' => ['runs:read']])->assertUnauthorized();
        $guest = User::factory()->create(['guest_at' => now()]);
        $this->actingAs($guest)->withToken('')->postJson('/web-api/developer/keys', ['name' => 'x', 'scopes' => ['runs:read']])->assertUnauthorized();
    }

    public function test_everything_is_hidden_while_the_flag_is_off(): void
    {
        [, $secret] = $this->makeKey();
        config(['platform.api_keys' => false]);
        $this->asKey($secret)->getJson('/api/platform/v1/runs')->assertNotFound()->assertJsonPath('code', 'not_available');
        $this->actingAs($this->user)->withToken('')->postJson('/web-api/developer/keys', ['name' => 'x', 'scopes' => ['runs:read']])->assertNotFound();
        $this->getJson('/web-api/developer')->assertNotFound();
    }
}
