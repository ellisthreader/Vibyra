<?php
namespace Tests\Feature\CloudAllowance;

use App\Services\CloudWorkspaces\Allowance;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

class AllowanceMeterTest extends AllowanceTestCase
{
    public function test_without_configured_hours_nothing_changes(): void
    {
        $before = $this->balance();
        $r = $this->reserve();
        $this->assertSame(3000, (int) $r->reserved);
        $this->assertSame(3000, (int) $r->spend_held);
        $r = $this->settle(90);
        $this->assertSame(3000, (int) $r->charged);
        $this->assertSame([0, 90], [(int) $r->allowance_seconds, (int) $r->token_seconds]);
        $this->assertSame($before - 3000, $this->balance());
        $this->assertSame(0, app(Allowance::class)->remainingSeconds($this->user->id));
    }

    public function test_allowance_covers_all_so_no_tokens_are_held_or_charged(): void
    {
        $this->hours(1);
        $before = $this->balance();
        $r = $this->reserve();
        $this->assertSame(0, (int) $r->reserved);
        $this->assertSame(3000, (int) $r->spend_held, 'spend ceilings still count the runway');
        $this->assertSame($before, $this->balance());
        $r = $this->settle(90);
        $this->assertSame(0, (int) $r->charged);
        $this->assertSame([90, 0], [(int) $r->allowance_seconds, (int) $r->token_seconds]);
        $this->assertSame($before, $this->balance());
        $this->assertSame(3510, app(Allowance::class)->remainingSeconds($this->user->id));
        $this->assertSame(0, (int) DB::table('vibes_spend_days')->sum('held'), 'hold released');
        $this->assertGreaterThan(0, (int) DB::table('vibes_spend_days')->sum('spent'), 'provider cost still recorded');
        $this->assertSame((int) (90 * 91700 / 3600), (int) $r->actual_micro_usd);
    }

    public function test_partial_allowance_then_tokens_for_the_rest(): void
    {
        $this->hours(45 / 3600);
        $before = $this->balance();
        $r = $this->reserve();
        $this->assertSame(1500, (int) $r->reserved, 'half the runway is covered');
        $r = $this->settle(90);
        $this->assertSame([45, 45], [(int) $r->allowance_seconds, (int) $r->token_seconds]);
        $this->assertSame(1500, (int) $r->charged);
        $this->assertSame($before - 1500, $this->balance());
        $this->assertSame(0, app(Allowance::class)->remainingSeconds($this->user->id));
        $this->assertSame(1500, (int) DB::table('cloud_workspaces')->where('id', $this->wid)->value('runtime_charged_units'));
    }

    public function test_exhausted_with_tokens_overage_charges_tokens(): void
    {
        $this->hours(1);
        $this->consumed(3600);
        $before = $this->balance();
        $r = $this->reserve();
        $this->assertSame(3000, (int) $r->reserved);
        $r = $this->settle(90);
        $this->assertSame([0, 90, 3000], [(int) $r->allowance_seconds, (int) $r->token_seconds, (int) $r->charged]);
        $this->assertSame($before - 3000, $this->balance());
    }

    public function test_exhausted_with_blocked_overage_refuses_a_new_hold(): void
    {
        $this->hours(1, 'blocked');
        $this->consumed(3600);
        $before = $this->balance();
        try {
            $this->reserve();
            $this->fail('expected 402');
        } catch (HttpResponseException $e) {
            $this->assertSame(402, $e->getResponse()->getStatusCode());
            $this->assertSame('allowance_exhausted', $e->getResponse()->getData(true)['code']);
        }
        $this->assertSame($before, $this->balance());
        $this->assertSame(0, DB::table('cloud_reservations')->count());
        $this->assertTrue(app(Allowance::class)->exhaustedAndBlocked($this->user->id));
    }

    public function test_blocked_overage_never_charges_tokens_for_a_window_that_runs_past_the_end(): void
    {
        $this->hours(60 / 3600, 'blocked');
        $before = $this->balance();
        $r = $this->reserve();
        $this->assertSame(0, (int) $r->reserved);
        $r = $this->settle(90);
        $this->assertSame([60, 0, 0], [(int) $r->allowance_seconds, (int) $r->token_seconds, (int) $r->charged]);
        $this->assertSame($before, $this->balance());
        $this->assertSame(30, (int) DB::table('cloud_allowance_usage')->where('kind', 'overrun')->sum('seconds'));
        $this->assertSame(60, app(Allowance::class)->summary($this->user->id)['usedSeconds']);
    }

    public function test_provider_cost_and_ceilings_apply_to_allowance_seconds(): void
    {
        $this->hours(1);
        config(['cloud_workspaces.daily_micro_limit' => 2000]);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        $this->reserve();
    }

    public function test_final_settle_rounds_tokens_up_on_the_token_part_only(): void
    {
        $this->hours(10 / 3600);
        $this->reserve();
        $r = $this->settle(11, true);
        $this->assertSame([10, 1], [(int) $r->allowance_seconds, (int) $r->token_seconds]);
        $this->assertSame(34, (int) $r->charged, '1s at 120000/h = 33.33 units, rounded up once at the end');
    }
}
