<?php
namespace Tests\Feature\SpendCaps;

use App\Services\Assistant\Budget;
use App\Services\Spend\Refusal;
use Illuminate\Support\Facades\{DB, Http};
use Illuminate\Support\Str;

class SpendCapsAssistantTest extends SpendCapsTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['assistant.enabled' => true, 'services.openai.key' => 'server-test-secret']);
        Http::preventStrayRequests();
    }

    private function reserve(int $micro = 5_000): string
    {
        return app(Budget::class)->reserve($this->user->id, (string) Str::uuid(), 'chat', $micro);
    }

    public function test_assistant_reserve_and_settle_move_the_same_counters_and_a_reached_cap_refuses_before_any_hold(): void
    {
        $this->caps(day: 1);
        $first = $this->reserve();
        $this->assertSame([5_000, 0], [(int) $this->row()->held, (int) $this->row()->spent]);
        app(Budget::class)->finish($first, 1_200);
        app(Budget::class)->finish($first, 5_000); // replay changes nothing
        $this->assertSame([0, 1_200], [(int) $this->row()->held, (int) $this->row()->spent]);
        app(Budget::class)->finish($this->reserve(9_000), null);
        $this->assertSame(1_200, (int) $this->row()->spent, 'unknown usage is absorbed by Vibyra, so it is not the person\'s spend');
        $this->travelTo(now()->addMinute());
        $this->reserve(9_000); // 1,200 used of 10,000: admitted although its reservation crosses the cap
        $this->assertSame(10_200, $this->used());
        $balance = $this->balance();
        try { $this->reserve(); $this->fail('expected a refusal'); } catch (Refusal $e) { $this->assertSame('day', $e->detail['cap']); }
        $this->assertSame($balance, $this->balance());
        $this->assertSame(0, DB::table('assistant_requests')->whereNotIn('state', ['reserved', 'complete', 'uncertain'])->count());
    }

    public function test_over_http_the_assistant_gets_429_spend_cap_not_a_token_upsell(): void
    {
        $this->caps(day: 0.5);
        $this->reserve(5_000);
        DB::table('assistant_requests')->update(['state' => 'complete']);
        $this->postJson('/api/assistant/chat', ['requestId' => (string) Str::uuid(), 'messages' => [['role' => 'user', 'content' => 'Hello']]])
            ->assertStatus(429)->assertJsonPath('code', 'spend_cap')->assertJsonPath('cap', 'day');
    }
}
