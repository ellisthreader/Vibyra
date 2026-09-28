<?php

declare(strict_types=1);

function productionWebsiteGroups(PDO $db, array $bounds, string $column,
    int $minimum = 1, bool $last = false): array
{
    $direction = $last ? 'DESC' : 'ASC';
    $sql = "SELECT {$column} AS label, COUNT(*) AS count FROM (
        SELECT DISTINCT ON (visitor_hash) {$column} FROM analytics_events
        WHERE surface = 'website' AND event = 'website_page_view'
            AND visitor_hash IS NOT NULL AND occurred_at BETWEEN ? AND ?
        ORDER BY visitor_hash, occurred_at {$direction}, id {$direction}
    ) AS page WHERE {$column} IS NOT NULL
    GROUP BY {$column} HAVING COUNT(*) >= ? ORDER BY count DESC LIMIT 12";
    return array_map(static fn (array $item): array =>
        ['label' => $item['label'], 'count' => (int) $item['count']],
        rows($db, $sql, [...$bounds, $minimum]));
}

function productionWebsiteFunnel(PDO $db, array $bounds, string $label,
    string $intent, ?string $dimension, string $completion): array
{
    $where = $dimension === null ? '' : ' AND dimension = ?';
    $sql = "SELECT COUNT(visited_id) AS visited,
        COUNT(*) FILTER (WHERE intent_id > visited_id) AS started,
        COUNT(*) FILTER (WHERE completed_id > intent_id AND intent_id > visited_id) AS completed
        FROM (SELECT visitor_hash,
            MIN(id) FILTER (WHERE event = 'website_page_view') AS visited_id,
            MIN(id) FILTER (WHERE event = ?{$where}) AS intent_id,
            MIN(id) FILTER (WHERE event = ?) AS completed_id
            FROM analytics_events WHERE surface = 'website'
                AND visitor_hash IS NOT NULL AND occurred_at BETWEEN ? AND ?
            GROUP BY visitor_hash) AS journey";
    $item = row($db, $sql, array_merge([$intent], $dimension === null ? [] : [$dimension],
        [$completion], $bounds));
    return ['name' => $label, 'visited' => (int) ($item['visited'] ?? 0),
        'started' => (int) ($item['started'] ?? 0), 'completed' => (int) ($item['completed'] ?? 0)];
}

function productionWebsiteDetails(PDO $db, array $bounds, bool $available,
    bool $detailsAvailable): array
{
    $result = ['overview' => [], 'breakdowns' => [], 'daily' => [], 'quality' => []];
    $result['quality']['website_last_error_at'] = row($db,
        "SELECT MAX(created_at) AS last_at FROM analytics_events
            WHERE surface = 'website' AND event = 'website_error'")['last_at'] ?? null;
    foreach (['waitlist_signups' => 'website_waitlist_signup',
        'verified_purchases' => 'website_purchase'] as $key => $event) {
        $result['overview'][$key] = (int) (row($db,
            'SELECT COUNT(*) AS count FROM analytics_events WHERE surface = \'website\'
                AND event = ? AND occurred_at BETWEEN ? AND ?', [$event, ...$bounds])['count'] ?? 0);
    }
    $names = ['consented_signups' => 'website_signup_completed',
        'consented_downloads' => 'website_download_completed',
        'consented_waitlist' => 'website_waitlist_completed',
        'checkout_starts' => 'website_checkout_started',
        'faq_answers' => 'website_faq_answered', 'error_events' => 'website_error'];
    foreach ($names as $key => $event) {
        $result['overview'][$key] = $available ? (int) (row($db,
            'SELECT COUNT(*) AS count FROM analytics_events WHERE surface = \'website\'
                AND event = ? AND occurred_at BETWEEN ? AND ?', [$event, ...$bounds])['count'] ?? 0)
            : null;
    }
    if (! $available || ! $detailsAvailable) return $result;
    foreach (['website_channels' => 'acquisition_channel',
        'website_sources' => 'source', 'website_campaigns' => 'campaign',
        'website_referrers' => 'referrer_domain', 'website_landing_pages' => 'dimension',
        'website_devices' => 'device_type', 'website_browsers' => 'browser_family'] as $key => $column) {
        $result['breakdowns'][$key] = productionWebsiteGroups($db, $bounds, $column,
            in_array($key, ['website_campaigns', 'website_referrers'], true) ? 5 : 1);
    }
    $result['breakdowns']['website_exit_pages'] = productionWebsiteGroups($db, $bounds, 'dimension', 1, true);
    $result['breakdowns']['website_regions'] = array_map(static fn (array $item): array =>
        ['region' => $item['region'], 'count' => (int) $item['count']], rows($db,
        "SELECT country_code || '-' || region_code AS region, COUNT(*) AS count FROM (
            SELECT DISTINCT ON (visitor_hash) country_code, region_code
            FROM analytics_events WHERE surface = 'website' AND event = 'website_page_view'
                AND visitor_hash IS NOT NULL AND occurred_at BETWEEN ? AND ?
            ORDER BY visitor_hash, occurred_at, id) AS first_page
        WHERE country_code IS NOT NULL AND region_code IS NOT NULL
        GROUP BY country_code, region_code HAVING COUNT(*) >= 5 ORDER BY count DESC LIMIT 12", $bounds));
    $result['breakdowns']['website_errors'] = array_map(static fn (array $item): array =>
        ['category' => $item['category'], 'count' => (int) $item['count']], rows($db,
        "SELECT error_category AS category, COUNT(*) AS count FROM analytics_events
            WHERE surface = 'website' AND event = 'website_error' AND error_category IS NOT NULL
                AND occurred_at BETWEEN ? AND ? GROUP BY error_category ORDER BY count DESC", $bounds));
    $result['breakdowns']['website_performance'] = [];
    foreach (['ttfb' => 800, 'lcp' => 2500, 'inp' => 200, 'cls' => 100] as $name => $threshold) {
        $item = row($db, "SELECT COUNT(*) AS samples,
            COUNT(*) FILTER (WHERE metric_value <= ?) AS good FROM analytics_events
            WHERE surface = 'website' AND event = 'website_performance'
                AND metric_name = ? AND occurred_at BETWEEN ? AND ?",
            [$threshold, $name, ...$bounds]);
        $result['breakdowns']['website_performance'][] = ['metric' => $name,
            'samples' => (int) ($item['samples'] ?? 0), 'good' => (int) ($item['good'] ?? 0)];
    }
    $result['breakdowns']['website_funnels'] = [
        productionWebsiteFunnel($db, $bounds, 'Signup', 'website_signup_attempted', null, 'website_signup_completed'),
        productionWebsiteFunnel($db, $bounds, 'Download', 'website_download_requested', null, 'website_download_completed'),
        productionWebsiteFunnel($db, $bounds, 'Phone waitlist', 'website_waitlist_attempted', null, 'website_waitlist_completed'),
    ];
    foreach (rows($db, "SELECT DATE(occurred_at) AS day,
        COUNT(*) FILTER (WHERE event = 'website_error') AS errors,
        COUNT(*) FILTER (WHERE event = 'website_performance' AND metric_name = 'lcp'
            AND metric_value > 2500) AS slow_loads FROM analytics_events
        WHERE surface = 'website' AND occurred_at BETWEEN ? AND ?
            AND event IN ('website_error', 'website_performance')
        GROUP BY DATE(occurred_at)", $bounds) as $item) {
        $result['daily'][$item['day']] = ['errors' => (int) $item['errors'],
            'slow_loads' => (int) $item['slow_loads']];
    }
    return $result;
}

function productionWebsiteIngestCounts(PDO $db, array $bounds): array
{
    $counts = ['accepted' => 0, 'rejected' => 0, 'blocked' => 0];
    foreach (rows($db, 'SELECT status, SUM(count) AS total FROM analytics_ingest_counts
        WHERE surface = \'website\' AND day BETWEEN ? AND ? GROUP BY status',
        [substr($bounds[0], 0, 10), substr($bounds[1], 0, 10)]) as $item) {
        if (array_key_exists($item['status'], $counts)) $counts[$item['status']] = (int) $item['total'];
    }
    return $counts;
}
