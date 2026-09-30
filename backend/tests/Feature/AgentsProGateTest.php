<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class AgentsProGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['agents.enabled' => true, 'vibes.enabled' => true]);
    }

    private function signedIn(array $attributes = []): User
    {
        $user = User::factory()->create($attributes + ['plan' => 'free']);
        $token = 'agents-pro-'.$user->id;
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', $token), 'device_name' => 'Agents Pro test']);
        $this->withToken($token);

        return $user;
    }

    private function teammate(): array
    {
        return ['id' => (string) Str::uuid(), 'name' => 'Reviewer', 'brief' => 'Review code',
            'memory' => '', 'avatar' => 'review', 'budget' => 10, 'integrations' => []];
    }

    public function test_with_the_switch_off_a_free_account_keeps_creating_teammates(): void
    {
        config(['vibes.plan_limits_enabled' => false]);
        $this->signedIn();
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('entitled', true);
        $this->postJson('/api/agents/v1/teammates', $this->teammate())->assertOk();
    }

    public function test_with_the_switch_on_free_is_refused_but_can_still_read(): void
    {
        config(['vibes.plan_limits_enabled' => true]);
        $this->signedIn();
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('entitled', false);
        $this->postJson('/api/agents/v1/teammates', $this->teammate())->assertStatus(402)
            ->assertSee('Agents are part of Vibyra Pro');
    }

    public function test_with_the_switch_on_a_paid_plan_creates_teammates(): void
    {
        config(['vibes.plan_limits_enabled' => true]);
        $this->signedIn(['plan' => 'pro', 'membership_ends_at' => now()->addMonth()]);
        $this->getJson('/api/agents/v1/teammates')->assertOk()->assertJsonPath('entitled', true);
        $this->postJson('/api/agents/v1/teammates', $this->teammate())->assertOk();
    }

}
