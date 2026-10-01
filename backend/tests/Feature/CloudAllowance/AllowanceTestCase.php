<?php
namespace Tests\Feature\CloudAllowance;

use App\Services\CloudWorkspaces\{Allowance, Meter, Reservations, Workspaces};
use App\Services\Membership\Periods;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\CloudWorkspaces\CloudTestCase;

abstract class AllowanceTestCase extends CloudTestCase
{
    protected string $wid;

    protected function setUp(): void
    {
        parent::setUp();
        $this->wid = (string) Str::uuid();
        DB::table('cloud_workspaces')->insert(['id' => $this->wid, 'user_id' => $this->user->id, 'name' => 'Allowance', 'project_id' => 'a',
            'app_name' => 'a-'.str_replace('-', '', $this->wid), 'state' => 'ready', 'generation' => 1, 'budget_units' => 10000000,
            'units_per_hour' => 120000, 'provider_micro_per_hour' => 91700, 'tariff_version' => 'test-v1', 'created_at' => now(), 'updated_at' => now()]);
    }

    protected function hours(float $h, string $overage = 'tokens'): void
    {
        config(['vibes.plans.pro_v2.cloudHours' => $h, 'cloud_workspaces.overage' => $overage]);
    }

    protected function ws(): object
    {
        return app(Workspaces::class)->owned($this->user->id, $this->wid);
    }

    protected function balance(): int
    {
        return (int) DB::table('vibes_grants')->where('user_id', $this->user->id)->whereNull('revoked_at')->sum('remaining');
    }

    /** Reserve a runway under the wallet lock, as Start/Runtime do. */
    protected function reserve(): object
    {
        return DB::transaction(function () {
            app(Wallet::class)->lock($this->user->id);
            return app(Reservations::class)->reserve($this->ws(), 3000);
        });
    }

    /** Pretend $seconds of ready time elapsed and settle, as Runtime/Shutdown do under the locks. */
    protected function settle(int $seconds, bool $final = false): object
    {
        $from = now()->copy()->startOfSecond();
        DB::table('cloud_workspaces')->where('id', $this->wid)->update(['metered_at' => $from, 'lease_until' => $from->copy()->addSeconds($seconds + 30)]);
        Carbon::setTestNow($from->copy()->addSeconds($seconds));
        $r = DB::transaction(function () use ($final) {
            app(Wallet::class)->lock($this->user->id);
            app(Meter::class)->settle(DB::table('cloud_workspaces')->where('id', $this->wid)->first(), $final);
            return DB::table('cloud_reservations')->where('workspace_id', $this->wid)->orderByDesc('created_at')->first();
        });
        return $r;
    }

    protected function consumed(int $seconds, string $key = 'seed'): void
    {
        DB::table('cloud_allowance_usage')->insert(['user_id' => $this->user->id, 'workspace_id' => $this->wid, 'generation' => 1,
            'period_start' => app(Allowance::class)->period($this->user->id)[0]->format('Y-m-d H:i:s'), 'kind' => 'consume',
            'seconds' => $seconds, 'idempotency_key' => $key, 'created_at' => now()]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }
}
