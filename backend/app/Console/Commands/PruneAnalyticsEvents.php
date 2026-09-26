<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneAnalyticsEvents extends Command
{
    protected $signature = 'vibyra:prune-analytics';
    protected $description = 'Delete old metadata-only analytics events in bounded batches';

    public function handle(): int
    {
        $cutoff = now()->subDays((int) config('owner_analytics.retention_days', 90));
        do {
            $ids = DB::table('analytics_events')->where('created_at', '<', $cutoff)
                ->orderBy('created_at')->orderBy('id')->limit(1000)->pluck('id');
            if ($ids->isEmpty()) {
                break;
            }
            DB::table('analytics_events')->whereIn('id', $ids)->delete();
        } while ($ids->count() === 1000);

        DB::table('auth_login_events')->where('created_at', '<', $cutoff)->delete();

        return self::SUCCESS;
    }
}
