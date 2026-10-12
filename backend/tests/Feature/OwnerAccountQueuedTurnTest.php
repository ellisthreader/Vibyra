<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Http, Queue};
use Tests\TestCase;

class OwnerAccountQueuedTurnTest extends TestCase
{
    use RefreshDatabase, Support\FundedVibesTurns;

    protected function setUp(): void
    {
        parent::setUp(); $this->fundedSetUp(); Queue::fake();
    }

    public function test_ban_before_a_queued_turn_starts_releases_its_hold_without_provider_spend(): void
    {
        [$id] = $this->submit();
        $this->user->forceFill(['owner_banned_at' => now()])->save();
        $turn = $this->execute($id);
        $this->assertNotNull($turn->settled_at);
        $this->assertSame(0, (int) $turn->charged);
        $this->assertStringContainsString('revoked', $turn->error);
        Http::assertNothingSent();
    }

    public function test_ban_during_inference_settles_confirmed_usage_without_starting_tools(): void
    {
        [$id] = $this->submit();
        $this->answers(function () {
            $this->user->forceFill(['owner_banned_at' => now()])->save();
            return Http::response(['id' => 'gen-test-ban', 'usage' => ['cost' => 0.001],
                'choices' => [['message' => ['content' => '', 'tool_calls' => [['id' => 'never-run']]]]]]);
        });
        $turn = $this->execute($id);
        $this->assertNotNull($turn->settled_at);
        $this->assertSame(1000, (int) $turn->actual_micro_usd);
        $this->assertDatabaseMissing('vibes_tools', ['turn_id' => $id]);
        $this->assertCount(1, Http::recorded());
    }
}
