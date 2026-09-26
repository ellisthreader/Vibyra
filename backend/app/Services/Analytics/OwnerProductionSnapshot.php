<?php

namespace App\Services\Analytics;

class OwnerProductionSnapshot
{
    public function apply(array $report, int $days): ?array
    {
        $path = config('owner_analytics.production_snapshot_path');
        if (! is_file($path) || ! is_readable($path)) {
            return null;
        }
        $snapshot = json_decode((string) file_get_contents($path), true);
        $period = $snapshot['periods'][(string) $days] ?? null;
        if (! is_array($snapshot) || ! in_array($snapshot['schema_version'] ?? null, [1, 2], true)
            || ($snapshot['source'] ?? null) !== 'production' || ! is_array($period)
            || ! is_array($period['accounts'] ?? null) || ! is_array($period['ai'] ?? null)
            || ! is_array($period['memberships'] ?? null) || ! is_array($period['prompt_models'] ?? null)
            || ! is_string($snapshot['captured_at'] ?? null)) {
            return null;
        }

        $report['range'] = $period['range'];
        $report['overview']['accounts'] = $period['accounts'];
        $report['overview']['ai'] = $period['ai'];
        $report['overview']['operations'] = $period['operations'] ?? [];
        $report['series']['cloud'] = $period['cloud_series'] ?? [];
        $report['breakdowns']['memberships'] = $period['memberships'];
        $report['breakdowns']['prompt_models'] = $period['prompt_models'];

        $analytics = ($snapshot['schema_version'] ?? null) === 2
            && is_array($period['analytics'] ?? null)
            && is_array($period['analytics']['overview'] ?? null)
            && is_array($period['analytics']['series'] ?? null)
            && is_array($period['analytics']['breakdowns'] ?? null)
            ? $period['analytics'] : null;
        // Never mix production aggregates with the local development site's events.
        foreach (['website', 'desktop', 'mobile'] as $surface) {
            $report['overview'][$surface] = $analytics['overview'][$surface] ??
                array_fill_keys(array_keys($report['overview'][$surface]), null);
            $report['series'][$surface] = $analytics['series'][$surface] ?? [];
        }
        foreach (['website_pages', 'downloads', 'desktop_events', 'mobile_events',
            'desktop_platforms', 'desktop_providers', 'desktop_prompt_providers',
            'desktop_project_kinds', 'mobile_platforms', 'mobile_screens',
            'mobile_chat_efforts', 'mobile_project_providers', 'models',
            'website_ctas', 'website_download_clicks', 'website_countries'] as $key) {
            $report['breakdowns'][$key] = $analytics['breakdowns'][$key] ?? [];
        }
        $tracking = array_intersect_key((array) ($snapshot['tracking_by_surface'] ?? []),
            array_flip(['website', 'desktop', 'mobile']));
        $tracking += ['website' => null, 'desktop' => null, 'mobile' => null];
        $started = array_values(array_filter($tracking, 'is_string'));
        sort($started);
        $report['data_quality'] = [
            'source' => 'production',
            'captured_at' => $snapshot['captured_at'],
            'tracking_started_at' => $started[0] ?? null,
            'tracking_by_surface' => $tracking,
            'last_event_by_surface' => (array) ($snapshot['last_event_by_surface'] ?? [
                'website' => null, 'desktop' => null, 'mobile' => null,
            ]),
            'current_consent_choices' => $snapshot['current_consent_choices'] ?? null,
            'retention_days' => 90,
            'cloud_turns_available' => (bool) ($snapshot['availability']['vibes_turns'] ?? false),
            'notes' => [
                'Account, session, membership, and Vibes cloud turn totals are recorded production aggregates at the snapshot time.',
                'Website, desktop, and mobile events appear only after each production collector begins. A dash means unavailable, not zero.',
                'Optional usage covers only people who accepted analytics. A download response is not an installation.',
                'Vibes cloud turns do not include desktop prompts sent directly to other providers.',
            ],
        ];

        return $report;
    }
}
