<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Facades\{Cache, DB, Log};

/** Operator-wide ceilings, so a crowd of accounts cannot run the hosted bill past what was approved. */
final class SpendGuard
{
    public function today(): int
    {
        $d = DB::table('vibes_spend_days')->where('day', now()->toDateString())->first();
        return $d ? (int) $d->held + (int) $d->spent : 0;
    }

    public function month(): int
    {
        $rows = DB::table('vibes_spend_days')->where('day', '>=', now()->startOfMonth()->toDateString())->get(['held', 'spent']);
        return (int) $rows->sum('held') + (int) $rows->sum('spent');
    }

    public function monthlyLimit(): int
    {
        $set = (int) config('cloud_workspaces.monthly_micro_limit');
        return $set > 0 ? $set : (int) config('cloud_workspaces.daily_micro_limit') * 31;
    }

    /** New starts stop at the soft limit; running computers keep going until the hard ceiling in Reservations. */
    public function admitStart(): void
    {
        $soft = max(1, min(100, (int) config('cloud_workspaces.soft_stop_percent'))) / 100;
        $daily = (int) config('cloud_workspaces.daily_micro_limit');
        $this->warn('day', $this->today(), $daily);
        $this->warn('month', $this->month(), $this->monthlyLimit());
        abort_if($daily > 0 && $this->today() >= $daily * $soft, 503, 'Hosted computing has reached today\'s capacity. Try again tomorrow.');
        abort_if($this->month() >= $this->monthlyLimit() * $soft, 503, 'Hosted computing has reached this month\'s capacity.');
    }

    /** Hard ceiling for every runway reservation, including ones that keep a running computer alive. */
    public function holdMonth(int $amount): void
    {
        abort_if($this->month() + $amount > $this->monthlyLimit(), 503, 'Hosted computing is at capacity.');
    }

    public function admitCreate(): void
    {
        abort_if(DB::table('cloud_workspaces')->where('state', '!=', 'deleted')->count() >= (int) config('cloud_workspaces.max_retained_global'),
            503, 'Hosted storage is at capacity. Try again later.');
    }

    private function warn(string $period, int $used, int $limit): void
    {
        $percent = (int) config('cloud_workspaces.warn_percent');
        if ($limit > 0 && $used >= $limit * $percent / 100 && Cache::add('cloud-spend-warning:'.$period.':'.now()->format($period === 'day' ? 'Y-m-d' : 'Y-m'), 1, now()->addDay())) {
            Log::critical('cloud.spend.warning', ['period' => $period, 'used' => $used, 'limit' => $limit, 'percent' => round($used / $limit * 100)]);
        }
    }
}
