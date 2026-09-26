<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class RollupAnalyticsEvents extends Command
{
    protected $signature = 'vibyra:rollup-analytics {--backfill=1 : Number of complete UTC days to rebuild, up to 90}';
    protected $description = 'Save non-identifying daily analytics totals before raw events expire';

    public function handle(): int
    {
        $days = filter_var($this->option('backfill'), FILTER_VALIDATE_INT);
        if ($days === false || $days < 1 || $days > 90) {
            $this->error('Choose 1 to 90 complete days.');

            return self::FAILURE;
        }

        for ($offset = $days; $offset >= 1; $offset--) {
            $day = Carbon::now('UTC')->startOfDay()->subDays($offset);
            $next = $day->copy()->addDay();
            $rows = DB::table('analytics_events')->where('occurred_at', '>=', $day)
                ->where('occurred_at', '<', $next)
                ->select('surface', 'event')
                ->selectRaw('COUNT(*) as events_count, COALESCE(SUM(engaged_seconds), 0) as engaged_seconds')
                ->selectRaw('COUNT(DISTINCT COALESCE(consent_subject_hash, visitor_hash)) as subjects')
                ->groupBy('surface', 'event')->get();

            DB::transaction(function () use ($day, $rows): void {
                DB::table('analytics_daily_rollups')->where('day', $day->toDateString())->delete();
                foreach ($rows as $row) {
                    // A rare event/day combination can still single out a person.
                    $operational = $row->surface === 'website'
                        && in_array($row->event, ['website_signup', 'website_download'], true);
                    if ((int) $row->events_count < 5 || (! $operational && (int) $row->subjects < 5)) {
                        continue;
                    }
                    DB::table('analytics_daily_rollups')->insert([
                        'day' => $day->toDateString(),
                        'surface' => $row->surface,
                        'event' => $row->event,
                        'events_count' => $row->events_count,
                        'engaged_seconds' => $row->engaged_seconds,
                        'created_at' => now(),
                    ]);
                }
            });
        }

        DB::table('analytics_daily_rollups')->where('day', '<', Carbon::now('UTC')->subMonths(13)->toDateString())->delete();

        return self::SUCCESS;
    }
}
