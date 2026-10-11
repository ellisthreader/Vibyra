<?php

namespace App\Services\Spend;

use App\Services\Notifications\Preferences;
use Illuminate\Support\Facades\DB;

/**
 * Few alerts: one at the warning share of a cap and one at 100% per period, plus one when
 * a task hits its per-task limit. Detected inside the settle transaction; the flags live on
 * the period row, so a new period starts fresh and a threshold can never fire twice. The
 * event goes through the existing inbox (`work_events` -> `Inbox::publish` -> push) as the
 * `spend` category, so quiet hours and the preference toggle apply as for any other push.
 */
final class Alerts
{
    public const PHASES = ['spend_80', 'spend_100', 'spend_run'];

    /** @param array<string,object> $rows period rows just updated, keyed by kind */
    public function after(int $user, object $wallet, array $rows): void
    {
        foreach ($rows as $kind => $row) {
            if ($row->ends_at <= now()->utc()->format('Y-m-d H:i:s')) continue;
            $limit = SpendCaps::limit($wallet, $kind, $row);
            if (!$limit) continue;
            $used = (int) $row->held + (int) $row->spent;
            $full = $used >= $limit && !$row->alerted_full;
            $warn = $used >= $limit * (float) config('spend_caps.warn_at') && !$row->alerted_warn;
            if ($full) { app(Counters::class)->flag($row->id, 'alerted_full'); if (!$row->alerted_warn) app(Counters::class)->flag($row->id, 'alerted_warn'); }
            elseif ($warn) app(Counters::class)->flag($row->id, 'alerted_warn');
            if ($full || $warn) $this->emit($user, $full ? 'spend_100' : 'spend_80', $kind.':'.$row->starts_at.':'.($full ? 100 : 80).':'.$limit,
                ['kind' => $kind, 'limit' => Refusal::tokens($limit), 'used' => Refusal::tokens($used),
                    'resetsAt' => \Illuminate\Support\Carbon::parse($row->ends_at, 'UTC')->toIso8601String(), 'timezone' => $wallet->cap_timezone]);
        }
    }

    /** A task stopped at its per-task limit. */
    public function run(int $user, string $turn, int $limit, int $used): void
    {
        $this->emit($user, 'spend_run', 'run:'.$turn, ['kind' => 'run', 'limit' => Refusal::tokens($limit), 'used' => Refusal::tokens($used), 'turnId' => $turn]);
    }

    private function emit(int $user, string $phase, string $run, array $meta): void
    {
        if (!config('intelligence.inbox')) return;
        if (!app(Preferences::class)->get($user)->spend) return;
        DB::table('work_events')->insertOrIgnore(['user_id' => $user, 'source' => 'spend_cap', 'run_id' => $run,
            'fingerprint' => hash('sha256', $user.'|spend|'.$run.'|'.$phase), 'phase' => $phase,
            'metadata' => json_encode($meta, JSON_THROW_ON_ERROR), 'created_at' => now()]);
    }

    /** The inbox title: names the limit and how far along it is, nothing else. */
    public static function title(string $phase, array $meta): string
    {
        $name = ['day' => 'daily', 'month' => 'monthly', 'run' => 'per-task'][$meta['kind'] ?? 'day'] ?? 'spending';
        return match ($phase) {
            'spend_80' => 'You have used '.(int) round((float) config('spend_caps.warn_at') * 100)."% of your $name limit",
            'spend_100' => "You have reached your $name limit",
            default => 'A task paused at your per-task limit',
        };
    }
}
