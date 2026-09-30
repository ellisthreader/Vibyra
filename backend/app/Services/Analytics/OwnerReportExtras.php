<?php

namespace App\Services\Analytics;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class OwnerReportExtras
{
    public function apply(array $report, Carbon $from, Carbon $to, array $tracking): array
    {
        $events = DB::table('analytics_events')->whereBetween('occurred_at', [$from, $to]);
        foreach (['website', 'desktop', 'mobile'] as $surface) {
            $available = (bool) ($tracking[$surface] ?? null);
            $report['overview'][$surface]['engaged_seconds'] = $available
                ? (int) (clone $events)->where('surface', $surface)->sum('engaged_seconds') : null;
            $event = $surface.'_engagement_interval';
            $report['overview'][$surface]['recent_engaged_sessions_5m'] = $available
                ? DB::table('analytics_events')->where('surface', $surface)->where('event', $event)
                    ->where('occurred_at', '>=', now()->subMinutes(5))
                    ->distinct()->count($surface === 'website' ? 'visitor_hash' : 'consent_subject_hash') : null;
            if ($available) {
                $startDay = substr((string) $tracking[$surface], 0, 10);
                $report['series'][$surface] = array_values(array_filter($report['series'][$surface],
                    static fn (array $row): bool => $row['date'] >= $startDay));
            }
        }
        $website = $report['overview']['website'];
        foreach (['cta_clicks' => 'website_cta_clicked',
            'download_clicks' => 'website_download_clicked'] as $metric => $event) {
            $website[$metric] = $tracking['website'] ? (clone $events)->where('event', $event)->count() : null;
        }
        $report['overview']['website'] = $website;
        foreach (['desktop' => ['projects_opened' => 'desktop_project_opened',
            'previews_opened' => 'desktop_preview_opened'],
            'mobile' => ['projects_created' => 'mobile_project_created',
                'previews_opened' => 'mobile_preview_opened']] as $surface => $metrics) {
            foreach ($metrics as $metric => $event) {
                $report['overview'][$surface][$metric] = $tracking[$surface]
                    ? (clone $events)->where('event', $event)->count() : null;
            }
        }
        $report['overview']['accounts']['logins_30d'] = DB::table('auth_login_events')
            ->where('created_at', '>=', now()->subDays(30))->count();
        $report['data_quality']['current_consent_choices'] = DB::table('analytics_consents')
            ->select('surface', 'choice')->selectRaw('COUNT(*) as count')
            ->groupBy('surface', 'choice')->get()->all();

        foreach (['website_ctas' => ['website_cta_clicked', 'dimension', 'action'],
            'website_download_clicks' => ['website_download_clicked', 'dimension', 'platform']] as $name => $parts) {
            [$event, $column, $label] = $parts;
            $report['breakdowns'][$name] = (clone $events)->where('event', $event)->whereNotNull($column)
                ->select("{$column} as {$label}")->selectRaw('COUNT(*) as count')
                ->groupBy($column)->orderByDesc('count')->limit(12)->get()->all();
        }
        $report['breakdowns']['website_countries'] = (clone $events)
            ->where('event', 'website_page_view')->whereNotNull('country_code')
            ->select('country_code as country')->selectRaw('COUNT(DISTINCT visitor_hash) as count')
            ->groupBy('country_code')->havingRaw('COUNT(DISTINCT visitor_hash) >= 5')
            ->orderByDesc('count')->limit(12)->get()->all();
        $report['breakdowns']['app_countries'] = (clone $events)
            ->whereIn('surface', ['desktop', 'mobile'])->whereNotNull('country_code')
            ->select('surface', 'country_code as country')
            ->selectRaw('COUNT(DISTINCT consent_subject_hash) as count')
            ->groupBy('surface', 'country_code')
            ->havingRaw('COUNT(DISTINCT consent_subject_hash) >= 5')
            ->orderByDesc('count')->limit(24)->get()->all();

        $daily = (clone $events)->selectRaw('DATE(occurred_at) as day, surface, event,
            COUNT(*) as total, COALESCE(SUM(engaged_seconds), 0) as seconds')
            ->groupByRaw('DATE(occurred_at), surface, event')->get();
        foreach ($daily as $item) {
            $surface = $item->surface;
            if (! isset($report['series'][$surface])) continue;
            foreach ($report['series'][$surface] as &$row) {
                if ($row['date'] !== $item->day) continue;
                $row['engaged_seconds'] = ($row['engaged_seconds'] ?? 0) + (int) $item->seconds;
                if ($surface === 'website' && $item->event === 'website_cta_clicked') {
                    $row['cta_clicks'] = ($row['cta_clicks'] ?? 0) + (int) $item->total;
                }
                if ($surface === 'website' && $item->event === 'website_download_clicked') {
                    $row['download_clicks'] = ($row['download_clicks'] ?? 0) + (int) $item->total;
                }
                break;
            }
            unset($row);
        }
        $report['data_quality']['notes'][] = 'Optional usage and engaged time cover only people who allowed analytics. An active app count combines linked accounts and consented app sessions. The 5-minute figure is a recent engagement estimate, not a live connection count.';
        return app(OwnerOperationalReport::class)->apply($report, $from, $to);
    }
}
