<?php

namespace App\Services\Analytics;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class OwnerUsageReport
{
    public function read(Builder $events): array
    {
        $overview = [];
        foreach (['website', 'desktop', 'mobile'] as $surface) {
            $part = (clone $events)->where('surface', $surface);
            $overview[$surface] = [
                'engaged_seconds' => (int) (clone $part)->sum('engaged_seconds'),
                'countries_known' => (clone $part)->whereNotNull('country_code')->distinct()->count('country_code'),
            ];
        }
        $overview['website'] += [
            'cta_clicks' => (clone $events)->where('event', 'website_cta_clicked')->count(),
            'download_clicks' => (clone $events)->where('event', 'website_download_clicked')->count(),
        ];
        $overview['desktop'] += [
            'projects_opened' => (clone $events)->where('event', 'desktop_project_opened')->count(),
            'previews_opened' => (clone $events)->where('event', 'desktop_preview_opened')->count(),
        ];
        $overview['mobile'] += [
            'projects_created' => (clone $events)->where('event', 'mobile_project_created')->count(),
            'previews_opened' => (clone $events)->where('event', 'mobile_preview_opened')->count(),
        ];

        $liveCutoff = now()->subMinutes(5);
        $engagement = ['website' => 'website_engagement_interval',
            'desktop' => 'desktop_engagement_interval', 'mobile' => 'mobile_engagement_interval'];
        foreach ($engagement as $surface => $event) {
            $key = $surface === 'website' ? 'visitor_hash' : 'consent_subject_hash';
            $overview[$surface]['engaged_sessions_5m'] = (clone $events)->where('event', $event)
                ->where('occurred_at', '>=', $liveCutoff)->distinct()->count($key);
        }

        return [
            'overview' => $overview,
            'breakdowns' => [
                'website_ctas' => $this->dimensions($events, 'website_cta_clicked'),
                'website_download_clicks' => $this->dimensions($events, 'website_download_clicked'),
                'countries' => $this->countries($events),
            ],
            'data_quality' => [
                'last_event_at' => (clone $events)->max('created_at'),
                'current_consent_choices' => DB::table('analytics_consents')
                    ->select('surface', 'choice')->selectRaw('COUNT(*) as count')
                    ->groupBy('surface', 'choice')->get()->all(),
            ],
        ];
    }

    private function dimensions(Builder $events, string $event): array
    {
        return (clone $events)->where('event', $event)->whereNotNull('dimension')
            ->select('dimension')->selectRaw('COUNT(*) as count')->groupBy('dimension')
            ->orderByDesc('count')->limit(20)->get()->all();
    }

    private function countries(Builder $events): array
    {
        $rows = (clone $events)->select('surface', 'country_code')
            ->selectRaw('COUNT(*) as count')->groupBy('surface', 'country_code')
            ->orderByDesc('count')->get();
        $groups = [];
        foreach ($rows as $row) {
            // Suppress small cohorts rather than exposing a rare country by itself.
            $country = $row->country_code && $row->count >= 5 ? $row->country_code : 'other_or_unknown';
            $key = $row->surface.':'.$country;
            $groups[$key] = ($groups[$key] ?? 0) + (int) $row->count;
        }

        return array_values(array_map(static function (string $key, int $count): array {
            [$surface, $country] = explode(':', $key, 2);

            return compact('surface', 'country', 'count');
        }, array_keys($groups), array_values($groups)));
    }
}
