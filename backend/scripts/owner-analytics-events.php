<?php

declare(strict_types=1);

require_once __DIR__.'/owner-website-details.php';

function eventRows(PDO $db, string $sql, array $bounds): array
{
    return rows($db, $sql, $bounds);
}

function eventBreakdown(PDO $db, array $bounds, string $event, string $field, string $label): array
{
    $query = "SELECT {$field} AS {$label}, COUNT(*) AS count FROM analytics_events
        WHERE occurred_at BETWEEN ? AND ? AND event = ? AND {$field} IS NOT NULL
        GROUP BY {$field} ORDER BY count DESC, {$field} LIMIT 12";
    return array_map(static function (array $item) use ($label): array {
        return [$label => $item[$label], 'count' => (int) $item['count']];
    }, rows($db, $query, [...$bounds, $event]));
}

function productionAnalytics(PDO $db, DateTimeImmutable $from, DateTimeImmutable $to,
    array $tracking, bool $websiteDetailsAvailable = false, bool $ingestStatsAvailable = false): array
{
    $bounds = [$from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')];
    $surfaceKeys = [
        'website' => ['page_views' => 'website_page_view', 'signups' => 'website_signup',
            'downloads' => 'website_download', 'cta_clicks' => 'website_cta_clicked',
            'download_clicks' => 'website_download_clicked'],
        'desktop' => ['app_opens' => 'desktop_app_opened', 'projects_created' => 'desktop_project_created',
            'terminals_started' => 'desktop_terminal_started', 'prompts_submitted' => 'desktop_prompt_submitted'],
        'mobile' => ['app_opens' => 'mobile_app_opened', 'chat_prompts' => 'mobile_chat_prompt_sent',
            'project_prompts' => 'mobile_project_prompt_sent'],
    ];
    $counts = [];
    foreach (eventRows($db, 'SELECT surface, event, COUNT(*) AS total FROM analytics_events
        WHERE occurred_at BETWEEN ? AND ? GROUP BY surface, event', $bounds) as $item) {
        $counts[$item['surface']][$item['event']] = (int) $item['total'];
    }
    $overview = [];
    foreach ($surfaceKeys as $surface => $keys) {
        foreach ($keys as $metric => $event) {
            $overview[$surface][$metric] = ($tracking[$surface]
                || ($surface === 'website' && in_array($metric, ['signups', 'downloads'], true)))
                ? ($counts[$surface][$event] ?? 0) : null;
        }
    }
    $actor = "CASE WHEN user_id IS NOT NULL THEN 'u:' || user_id::text ELSE 's:' || consent_subject_hash END";
    $distinct = eventRows($db, "SELECT surface, COUNT(DISTINCT {$actor}) AS users,
        COUNT(DISTINCT visitor_hash) FILTER (WHERE event = 'website_page_view') AS visitors,
        COALESCE(SUM(engaged_seconds), 0) AS engaged FROM analytics_events
        WHERE occurred_at BETWEEN ? AND ? GROUP BY surface", $bounds);
    foreach ($distinct as $item) {
        if ($item['surface'] === 'website') {
            $overview['website']['unique_visitors'] = (int) $item['visitors'];
            $overview['website']['engaged_seconds'] = (int) $item['engaged'];
        } elseif (isset($overview[$item['surface']])) {
            $overview[$item['surface']]['active_users'] = (int) $item['users'];
            $overview[$item['surface']]['engaged_seconds'] = (int) $item['engaged'];
        }
    }
    foreach (['website' => ['unique_visitors', 'engaged_seconds'],
        'desktop' => ['active_users', 'engaged_seconds'],
        'mobile' => ['active_users', 'engaged_seconds']] as $surface => $metrics) {
        foreach ($metrics as $metric) $overview[$surface][$metric] ??= $tracking[$surface] ? 0 : null;
    }
    foreach (['website', 'desktop', 'mobile'] as $surface) {
        $field = $surface === 'website' ? 'visitor_hash' : 'consent_subject_hash';
        $recent = row($db, "SELECT COUNT(DISTINCT {$field}) AS total FROM analytics_events
            WHERE surface = ? AND event = ? AND occurred_at BETWEEN ? AND ?", [
            $surface, $surface.'_engagement_interval',
            $to->modify('-5 minutes')->format('Y-m-d H:i:s'), $bounds[1],
        ]);
        $overview[$surface]['recent_engaged_sessions_5m'] = $tracking[$surface]
            ? (int) ($recent['total'] ?? 0) : null;
    }

    $series = ['website' => [], 'desktop' => [], 'mobile' => []];
    $cursor = $from;
    while ($cursor <= $to) {
        $day = $cursor->format('Y-m-d');
        foreach ($surfaceKeys as $surface => $keys) {
            if ($tracking[$surface] && $day >= substr((string) $tracking[$surface], 0, 10)) {
                $series[$surface][$day] = ['date' => $day];
                foreach ($keys as $metric => $_) $series[$surface][$day][$metric] = 0;
                $series[$surface][$day][$surface === 'website' ? 'unique_visitors' : 'active_users'] = 0;
                $series[$surface][$day]['engaged_seconds'] = 0;
            }
        }
        $cursor = $cursor->modify('+1 day');
    }
    foreach (eventRows($db, 'SELECT DATE(occurred_at) AS day, surface, event, COUNT(*) AS total,
        COALESCE(SUM(engaged_seconds), 0) AS engaged FROM analytics_events
        WHERE occurred_at BETWEEN ? AND ? GROUP BY DATE(occurred_at), surface, event', $bounds) as $item) {
        $day = $item['day'];
        $surface = $item['surface'];
        if (! isset($series[$surface][$day])) continue;
        $metric = array_search($item['event'], $surfaceKeys[$surface], true);
        if ($metric !== false) $series[$surface][$day][$metric] += (int) $item['total'];
        $series[$surface][$day]['engaged_seconds'] += (int) $item['engaged'];
    }
    foreach (eventRows($db, "SELECT DATE(occurred_at) AS day, surface, COUNT(DISTINCT {$actor}) AS users,
        COUNT(DISTINCT visitor_hash) FILTER (WHERE event = 'website_page_view') AS visitors
        FROM analytics_events WHERE occurred_at BETWEEN ? AND ?
        GROUP BY DATE(occurred_at), surface", $bounds) as $item) {
        $surface = $item['surface'];
        $day = $item['day'];
        if (! isset($series[$surface][$day])) continue;
        $series[$surface][$day][$surface === 'website' ? 'unique_visitors' : 'active_users']
            = (int) ($surface === 'website' ? $item['visitors'] : $item['users']);
    }

    $breakdowns = [
        'website_pages' => eventBreakdown($db, $bounds, 'website_page_view', 'dimension', 'path'),
        'downloads' => eventBreakdown($db, $bounds, 'website_download', 'dimension', 'platform'),
        'website_ctas' => eventBreakdown($db, $bounds, 'website_cta_clicked', 'dimension', 'action'),
        'website_download_clicks' => eventBreakdown($db, $bounds, 'website_download_clicked', 'dimension', 'platform'),
        'desktop_platforms' => eventBreakdown($db, $bounds, 'desktop_app_opened', 'platform', 'platform'),
        'desktop_providers' => eventBreakdown($db, $bounds, 'desktop_terminal_started', 'provider', 'provider'),
        'desktop_prompt_providers' => eventBreakdown($db, $bounds, 'desktop_prompt_submitted', 'provider', 'provider'),
        'desktop_project_kinds' => eventBreakdown($db, $bounds, 'desktop_project_created', 'project_kind', 'project_kind'),
        'mobile_platforms' => eventBreakdown($db, $bounds, 'mobile_app_opened', 'platform', 'platform'),
        'mobile_screens' => eventBreakdown($db, $bounds, 'mobile_screen_viewed', 'screen', 'screen'),
        'mobile_chat_efforts' => eventBreakdown($db, $bounds, 'mobile_chat_prompt_sent', 'effort', 'effort'),
        'mobile_project_providers' => eventBreakdown($db, $bounds, 'mobile_project_prompt_sent', 'provider', 'provider'),
    ];
    $breakdowns['website_countries'] = array_map(static fn (array $item): array =>
        ['country' => $item['country_code'], 'count' => (int) $item['count']],
        rows($db, 'SELECT country_code, COUNT(DISTINCT visitor_hash) AS count FROM analytics_events
            WHERE occurred_at BETWEEN ? AND ? AND surface = \'website\' AND event = \'website_page_view\'
            AND country_code IS NOT NULL GROUP BY country_code
            HAVING COUNT(DISTINCT visitor_hash) >= 5 ORDER BY count DESC, country_code LIMIT 12', $bounds));
    foreach (['desktop', 'mobile'] as $surface) {
        $breakdowns[$surface.'_events'] = array_map(static fn (array $item): array =>
            ['event' => $item['event'], 'count' => (int) $item['count']],
            rows($db, 'SELECT event, COUNT(*) AS count FROM analytics_events WHERE occurred_at BETWEEN ? AND ?
                AND surface = ? GROUP BY event ORDER BY count DESC, event LIMIT 20', [...$bounds, $surface]));
    }
    $breakdowns['models'] = array_map(static fn (array $item): array =>
        ['surface' => $item['surface'], 'model' => $item['model'], 'count' => (int) $item['count']],
        rows($db, "SELECT surface, dimension AS model, COUNT(*) AS count FROM analytics_events
            WHERE occurred_at BETWEEN ? AND ? AND event IN ('desktop_prompt_submitted', 'mobile_chat_prompt_sent')
            AND dimension IS NOT NULL GROUP BY surface, dimension ORDER BY count DESC LIMIT 12", $bounds));

    $website = productionWebsiteDetails($db, $bounds, (bool) $tracking['website'],
        $websiteDetailsAvailable);
    $overview['website'] = array_merge($overview['website'], $website['overview']);
    if ($websiteDetailsAvailable) {
        $breakdowns = array_merge($breakdowns, $website['breakdowns']);
        foreach ($series['website'] as $day => &$point) {
            $point += $website['daily'][$day] ?? ['errors' => 0, 'slow_loads' => 0];
        }
        unset($point);
    }
    $quality = $website['quality'];
    if ($ingestStatsAvailable) {
        $quality['website_ingest_counts'] = productionWebsiteIngestCounts($db, $bounds);
    }
    return ['overview' => $overview, 'series' => array_map('array_values', $series),
        'breakdowns' => $breakdowns, 'quality' => $quality];
}
