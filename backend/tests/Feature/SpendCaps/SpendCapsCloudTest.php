<?php
namespace Tests\Feature\SpendCaps;

use App\Services\CloudWorkspaces\Allowance;
use App\Services\Spend\Refusal;
use Illuminate\Support\Facades\DB;
use Tests\Feature\CloudAllowance\AllowanceTestCase;

/** Cloud computer runtime holds count toward caps; included hours never do. */
class SpendCapsCloudTest extends AllowanceTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['spend_caps.enabled' => true]);
    }

    private function cap(?int $dayUnits, ?string $choice = null): void
    {
        DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['cap_day_units' => $dayUnits, 'cap_timezone' => 'UTC', 'cloud_hours_overage' => $choice]);
    }

    public function test_token_runtime_counts_toward_the_cap_and_a_reached_cap_refuses_the_next_hold(): void
    {
        $this->cap(5_000);
        $this->reserve();
        $this->assertSame(3_000, (int) DB::table('wallet_spend_periods')->where('kind', 'day')->value('held'));
        $r = $this->settle(90);
        $this->assertSame(3_000, (int) $r->charged);
        $this->assertSame([0, 3_000], [(int) DB::table('wallet_spend_periods')->where('kind', 'day')->value('held'),
            (int) DB::table('wallet_spend_periods')->where('kind', 'day')->value('spent')]);
        $this->reserve(); $this->settle(90);
        $before = $this->balance();
        try { $this->reserve(); $this->fail('expected a refusal'); }
        catch (Refusal $e) { $this->assertSame(['day', 429], [$e->detail['cap'], $e->getStatusCode()]); }
        $this->assertSame($before, $this->balance(), 'nothing was held');
    }

    public function test_hours_covered_by_the_allowance_are_not_spend_and_are_never_capped(): void
    {
        $this->hours(1);
        $this->cap(1);
        $r = $this->reserve();
        $this->assertSame(0, (int) $r->reserved);
        $this->assertSame(0, DB::table('wallet_spend_periods')->count());
    }

    public function test_the_included_hours_choice_overrides_the_operator_default_for_that_person_only(): void
    {
        $this->hours(1, 'tokens');
        $this->consumed(3600);
        $a = app(Allowance::class);
        $this->assertSame(['tokens', false], [$a->overage($this->user->id), $a->exhaustedAndBlocked($this->user->id)]);
        $this->cap(null, 'stop');
        $this->assertSame(['blocked', true], [$a->overage($this->user->id), $a->exhaustedAndBlocked($this->user->id)]);
        $this->assertSame('blocked', $a->summary($this->user->id)['overage']);
        $this->hours(1, 'blocked');
        $this->cap(null, 'tokens');
        $this->assertSame('tokens', $a->overage($this->user->id), 'the person chose tokens');
        config(['spend_caps.enabled' => false]);
        $this->assertSame('blocked', $a->overage($this->user->id), 'flag off: operator default');
    }
}
