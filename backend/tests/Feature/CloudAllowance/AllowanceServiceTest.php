<?php
namespace Tests\Feature\CloudAllowance;

use App\Models\User;
use App\Services\CloudWorkspaces\Allowance;
use App\Services\Membership\{Enrollment, Periods};
use App\Services\Vibes\{Plans, Wallet};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AllowanceServiceTest extends AllowanceTestCase
{
    public function test_plans_carry_the_allowance_and_free_has_none(): void
    {
        $this->assertSame(0.0, app(Plans::class)->cloudHours('pro_v2'), 'default promises nothing');
        $this->assertSame(0.0, app(Plans::class)->cloudHours('free'));
        $this->hours(20);
        $this->assertSame(20.0, app(Plans::class)->cloudHours('pro_v2'));
        $this->assertSame(0.0, app(Plans::class)->cloudHours('free'));
        $this->assertSame(72000, app(Allowance::class)->allowanceSeconds($this->user->id));
        $free = User::factory()->create(['email_verified_at' => now(), 'credits_balance' => 0]);
        app(Wallet::class)->ensure($free, 0);
        $this->assertSame(0, app(Allowance::class)->allowanceSeconds($free->id));
        $this->assertSame(0, app(Allowance::class)->remainingSeconds($free->id));
    }

    public function test_overage_policy_defaults_to_tokens_and_ignores_garbage(): void
    {
        $this->assertSame('tokens', app(Allowance::class)->overage());
        config(['cloud_workspaces.overage' => 'blocked']);
        $this->assertSame('blocked', app(Allowance::class)->summary($this->user->id)['overage']);
        config(['cloud_workspaces.overage' => 'whatever']);
        $this->assertSame('tokens', app(Allowance::class)->overage());
    }

    public function test_summary_shape_and_reset_time_from_the_membership_period(): void
    {
        $this->hours(2);
        $this->consumed(1000);
        $s = app(Allowance::class)->summary($this->user->id);
        $this->assertSame(['allowanceSeconds', 'usedSeconds', 'resetsAt', 'overage'], array_keys($s));
        $this->assertSame([7200, 1000, 'tokens'], [$s['allowanceSeconds'], $s['usedSeconds'], $s['overage']]);
        $this->assertSame(DB::table('membership_periods')->where('user_id', $this->user->id)->value('ends_at'), Carbon::parse($s['resetsAt'])->format('Y-m-d H:i:s'));
    }

    public function test_usage_resets_each_month_even_inside_a_longer_period(): void
    {
        $this->hours(1);
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['ends_at' => now()->addYear()]);
        $first = app(Allowance::class)->period($this->user->id);
        $this->consumed(3600);
        $this->assertSame(0, app(Allowance::class)->remainingSeconds($this->user->id));
        Carbon::setTestNow(now()->addDays(32));
        $second = app(Allowance::class)->period($this->user->id);
        $this->assertTrue($second[0]->gt($first[0]));
        $this->assertSame(3600, app(Allowance::class)->remainingSeconds($this->user->id));
        $this->assertSame(0, app(Allowance::class)->summary($this->user->id)['usedSeconds']);
    }

    public function test_double_consume_for_one_window_applies_once(): void
    {
        $this->hours(1);
        $a = app(Allowance::class);
        $this->assertSame(600, $a->consume($this->ws(), 600, 'w1'));
        $this->assertSame(600, $a->consume($this->ws(), 600, 'w1'));
        $this->assertSame(3000, $a->remainingSeconds($this->user->id));
        $this->assertSame(600, $a->consume($this->ws(), 600, 'w2'));
        $this->assertSame(2400, $a->remainingSeconds($this->user->id));
    }

    public function test_replay_keeps_the_first_split_even_after_hours_change(): void
    {
        $this->hours(0.1);
        $a = app(Allowance::class);
        $this->assertSame(360, $a->consume($this->ws(), 500, 'w'));
        $this->hours(5);
        $this->assertSame(360, $a->consume($this->ws(), 500, 'w'));
    }

    public function test_metering_the_same_window_twice_charges_once(): void
    {
        $this->hours(1);
        $this->reserve();
        $r = $this->settle(90);
        $again = \Illuminate\Support\Facades\DB::transaction(function () {
            app(\App\Services\CloudWorkspaces\Meter::class)->settle(DB::table('cloud_workspaces')->where('id', $this->wid)->first());
            return DB::table('cloud_reservations')->count();
        });
        $this->assertSame(1, $again);
        $this->assertSame(90, (int) DB::table('cloud_allowance_usage')->sum('seconds'));
        $this->assertSame(90, (int) $r->allowance_seconds);
    }

    public function test_release_returns_allowance_never_below_zero_and_only_once(): void
    {
        $this->hours(1);
        $a = app(Allowance::class);
        $a->consume($this->ws(), 600, 'w1');
        $this->assertSame(300, $a->release($this->ws(), 300, 'boot_failure'));
        $this->assertSame(300, $a->summary($this->user->id)['usedSeconds']);
        $this->assertSame(300, $a->release($this->ws(), 300, 'boot_failure'), 'replay reports the original amount');
        $this->assertSame(300, $a->summary($this->user->id)['usedSeconds']);
        $this->assertSame(300, $a->release($this->ws(), 9999, 'refund'), 'clamped to what was consumed');
        $this->assertSame(0, $a->summary($this->user->id)['usedSeconds']);
        $this->assertSame(0, $a->release($this->ws(), 50, 'again'));
        $this->assertSame(3600, $a->remainingSeconds($this->user->id));
    }

    public function test_release_cannot_return_another_workspaces_seconds(): void
    {
        $this->hours(1);
        $a = app(Allowance::class);
        $a->consume($this->ws(), 600, 'w1');
        $other = (object) ['id' => (string) \Illuminate\Support\Str::uuid(), 'user_id' => $this->user->id, 'generation' => 1];
        $this->assertSame(0, $a->release($other, 100, 'refund'));
        $this->assertSame(600, $a->summary($this->user->id)['usedSeconds']);
    }

    public function test_consume_takes_the_wallet_lock_before_writing_the_ledger(): void
    {
        $this->hours(1);
        $order = [];
        DB::listen(function ($q) use (&$order) {
            if (str_contains($q->sql, 'vibes_wallets')) $order[] = 'wallet';
            if (str_starts_with($q->sql, 'insert') && str_contains($q->sql, 'cloud_allowance_usage')) $order[] = 'ledger';
        });
        app(Allowance::class)->consume($this->ws(), 60, 'lock');
        $this->assertSame('wallet', $order[0]);
        $this->assertContains('ledger', $order);
        $this->assertLessThan(array_search('ledger', $order), array_search('wallet', $order));
    }
}
