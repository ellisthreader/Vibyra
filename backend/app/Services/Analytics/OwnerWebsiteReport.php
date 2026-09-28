<?php

namespace App\Services\Analytics;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class OwnerWebsiteReport
{
    public function apply(array $report, Carbon $from, Carbon $to, bool $available): array
    {
        $events = DB::table('analytics_events')->where('surface', 'website')
            ->whereBetween('occurred_at', [$from, $to]);
        $website = $report['overview']['website'];
        $website['waitlist_signups'] = (clone $events)->where('event', 'website_waitlist_signup')->count();
        $website['verified_purchases'] = (clone $events)->where('event', 'website_purchase')->count();
        foreach (['consented_signups' => 'website_signup_completed',
            'consented_downloads' => 'website_download_completed',
            'consented_waitlist' => 'website_waitlist_completed',
            'checkout_starts' => 'website_checkout_started',
            'faq_answers' => 'website_faq_answered',
            'error_events' => 'website_error'] as $key => $event) {
            $website[$key] = $available ? (clone $events)->where('event', $event)->count() : null;
        }
        $report['overview']['website'] = $website;
        $report['data_quality']['website_ingestion_enabled'] = (bool) config('owner_analytics.ingestion_enabled');
        $report['data_quality']['website_details_available'] = true;
        $report['data_quality']['website_geo_available'] = is_file((string) config('services.maxmind.database_path'));
        $report['data_quality']['website_last_error_at'] = DB::table('analytics_events')
            ->where('surface', 'website')->where('event', 'website_error')->max('created_at');
        $report['data_quality']['website_ingest_counts'] = app(WebsiteIngestStats::class)->counts($from, $to);
        if (! $available) return $report;

        $first = $this->edgePages($events, 'ASC');
        $last = $this->edgePages($events, 'DESC');
        foreach (['website_channels' => 'acquisition_channel',
            'website_sources' => 'source', 'website_campaigns' => 'campaign',
            'website_referrers' => 'referrer_domain', 'website_landing_pages' => 'dimension',
            'website_devices' => 'device_type', 'website_browsers' => 'browser_family'] as $key => $column) {
            $report['breakdowns'][$key] = $this->groups($first, $column,
                $key === 'website_campaigns' || $key === 'website_referrers' ? 5 : 1);
        }
        $report['breakdowns']['website_exit_pages'] = $this->groups($last, 'dimension', 1);
        $report['breakdowns']['website_regions'] = DB::query()->fromSub($first, 'first_page')
            ->where('position', 1)->whereNotNull('country_code')->whereNotNull('region_code')
            ->selectRaw("country_code || '-' || region_code AS region, COUNT(*) AS count")
            ->groupBy('country_code', 'region_code')->havingRaw('COUNT(*) >= 5')
            ->orderByDesc('count')->limit(12)->get()->all();
        $report['breakdowns']['website_performance'] = $this->performance($events);
        $report['breakdowns']['website_errors'] = (clone $events)->where('event', 'website_error')
            ->whereNotNull('error_category')->select('error_category as category')
            ->selectRaw('COUNT(*) AS count')->groupBy('error_category')
            ->orderByDesc('count')->get()->all();
        $report['breakdowns']['website_funnels'] = [
            $this->funnel($events, 'Signup', 'website_signup_attempted', null, 'website_signup_completed'),
            $this->funnel($events, 'Download', 'website_download_requested', null, 'website_download_completed'),
            $this->funnel($events, 'Phone waitlist', 'website_waitlist_attempted', null, 'website_waitlist_completed'),
        ];
        $daily = (clone $events)->whereIn('event', ['website_error', 'website_performance'])
            ->selectRaw("DATE(occurred_at) AS day, SUM(CASE WHEN event = 'website_error' THEN 1 ELSE 0 END) AS errors,
                SUM(CASE WHEN event = 'website_performance' AND metric_name = 'lcp' AND metric_value > 2500 THEN 1 ELSE 0 END) AS slow_loads")
            ->groupByRaw('DATE(occurred_at)')->get()->keyBy('day');
        foreach ($report['series']['website'] as &$row) {
            $item = $daily[$row['date']] ?? null;
            $row['errors'] = (int) ($item->errors ?? 0);
            $row['slow_loads'] = (int) ($item->slow_loads ?? 0);
        }
        unset($row);
        return $report;
    }

    private function edgePages($events, string $direction)
    {
        return (clone $events)->where('event', 'website_page_view')->whereNotNull('visitor_hash')
            ->select(['visitor_hash', 'dimension', 'acquisition_channel', 'source', 'campaign',
                'referrer_domain', 'device_type', 'browser_family', 'country_code', 'region_code'])
            ->selectRaw("ROW_NUMBER() OVER (PARTITION BY visitor_hash ORDER BY occurred_at {$direction}, id {$direction}) AS position");
    }

    private function groups($edge, string $column, int $minimum): array
    {
        return DB::query()->fromSub(clone $edge, 'first_page')->where('position', 1)
            ->whereNotNull($column)->select("{$column} as label")
            ->selectRaw('COUNT(*) AS count')->groupBy($column)
            ->havingRaw('COUNT(*) >= ?', [$minimum])->orderByDesc('count')->limit(12)->get()->all();
    }

    private function performance($events): array
    {
        $thresholds = ['ttfb' => 800, 'lcp' => 2500, 'inp' => 200, 'cls' => 100];
        $rows = [];
        foreach ($thresholds as $name => $good) {
            $row = (clone $events)->where('event', 'website_performance')
                ->where('metric_name', $name)->selectRaw('COUNT(*) AS samples')
                ->selectRaw('SUM(CASE WHEN metric_value <= ? THEN 1 ELSE 0 END) AS good', [$good])->first();
            $rows[] = ['metric' => $name, 'samples' => (int) ($row->samples ?? 0),
                'good' => (int) ($row->good ?? 0)];
        }
        return $rows;
    }

    private function funnel($events, string $label, string $intentEvent,
        ?string $intentDimension, string $completionEvent): array
    {
        $intentClause = $intentDimension === null ? 'event = ?' : 'event = ? AND dimension = ?';
        $intentBindings = $intentDimension === null ? [$intentEvent] : [$intentEvent, $intentDimension];
        $sessions = (clone $events)->whereNotNull('visitor_hash')->groupBy('visitor_hash')
            ->selectRaw('visitor_hash')
            ->selectRaw("MIN(CASE WHEN event = 'website_page_view' THEN id END) AS visited_id")
            ->selectRaw("MIN(CASE WHEN {$intentClause} THEN id END) AS intent_id", $intentBindings)
            ->selectRaw("MIN(CASE WHEN event = ? THEN id END) AS completed_id", [$completionEvent]);
        $counts = DB::query()->fromSub($sessions, 'journey')->selectRaw('COUNT(visited_id) AS visited')
            ->selectRaw('SUM(CASE WHEN intent_id > visited_id THEN 1 ELSE 0 END) AS started')
            ->selectRaw('SUM(CASE WHEN completed_id > intent_id AND intent_id > visited_id THEN 1 ELSE 0 END) AS completed')
            ->first();
        return ['name' => $label, 'visited' => (int) ($counts->visited ?? 0),
            'started' => (int) ($counts->started ?? 0), 'completed' => (int) ($counts->completed ?? 0)];
    }
}
