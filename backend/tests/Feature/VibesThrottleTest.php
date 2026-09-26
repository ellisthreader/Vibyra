<?php

namespace Tests\Feature;

use App\Models\{User, VibyraSession};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class VibesThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['vibes.enabled' => true, 'services.openrouter.key' => 'test-only']);
        Queue::fake();
        $user = User::factory()->create(['email_verified_at' => now()]);
        VibyraSession::create(['user_id' => $user->id, 'token_hash' => hash('sha256', 'throttle-chat'), 'device_name' => 'iPhone']);
        $this->withToken('throttle-chat');
    }

    public function test_polling_and_quotes_do_not_spend_the_send_limit(): void
    {
        for ($i = 0; $i < 16; $i++) $this->getJson('/api/vibes/wallet')->assertOk();
        // Validation means the send route was reached. No provider call or Vibes are spent.
        $this->postJson('/api/vibes/turns', [])->assertUnprocessable();
    }

    public function test_the_send_limit_counts_each_attempt_once_and_still_enforces_twelve(): void
    {
        for ($i = 0; $i < 12; $i++) $this->postJson('/api/vibes/turns', [])->assertUnprocessable();
        $this->postJson('/api/vibes/turns', [])->assertStatus(429);
        $this->getJson('/api/vibes/wallet')->assertOk();
    }
}
