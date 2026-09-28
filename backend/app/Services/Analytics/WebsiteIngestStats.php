<?php

namespace App\Services\Analytics;

use Illuminate\Support\Facades\DB;
use Throwable;

class WebsiteIngestStats
{
    public function record(string $status): void
    {
        try {
            $key = ['day' => now()->toDateString(), 'surface' => 'website', 'status' => $status];
            DB::table('analytics_ingest_counts')->insertOrIgnore($key + ['count' => 0]);
            DB::table('analytics_ingest_counts')->where($key)->increment('count');
        } catch (Throwable $error) {
            report($error);
        }
    }

    public function counts($from, $to): array
    {
        $counts = ['accepted' => 0, 'rejected' => 0, 'blocked' => 0];
        foreach (DB::table('analytics_ingest_counts')->where('surface', 'website')
            ->whereBetween('day', [$from->toDateString(), $to->toDateString()])
            ->select('status')->selectRaw('SUM(count) AS total')->groupBy('status')->get() as $row) {
            if (array_key_exists($row->status, $counts)) $counts[$row->status] = (int) $row->total;
        }
        return $counts;
    }
}
