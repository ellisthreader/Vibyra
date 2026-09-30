<?php

declare(strict_types=1);

require_once __DIR__.'/owner-analytics-events.php';
require_once __DIR__.'/owner-operational-activity.php';

// Run locally with Railway's production Postgres variables; never from a web route.
if (PHP_SAPI !== 'cli' || getenv('RAILWAY_ENVIRONMENT_NAME') !== 'production') {
    fwrite(STDERR, "Run this CLI export with Railway's production environment.\n");
    exit(1);
}

$url = parse_url((string) getenv('DATABASE_PUBLIC_URL'));
if (!is_array($url) || !in_array($url['scheme'] ?? '', ['postgres', 'postgresql'], true)
    || empty($url['host']) || empty($url['path']) || empty($url['user']) || !isset($url['pass'])) {
    fwrite(STDERR, "A production DATABASE_PUBLIC_URL is required.\n");
    exit(1);
}

function columns(PDO $db, string $table): array
{
    $query = $db->prepare('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?');
    $query->execute([$table]);
    return $query->fetchAll(PDO::FETCH_COLUMN);
}

function hasColumns(array $columns, array $required): bool
{
    return count(array_diff($required, $columns)) === 0;
}

function row(PDO $db, string $sql, array $bindings = []): array
{
    $query = $db->prepare($sql);
    $query->execute($bindings);
    return $query->fetch(PDO::FETCH_ASSOC) ?: [];
}

function rows(PDO $db, string $sql, array $bindings = []): array
{
    $query = $db->prepare($sql);
    $query->execute($bindings);
    return $query->fetchAll(PDO::FETCH_ASSOC);
}

function nullableInt(mixed $value): ?int
{
    return $value === null ? null : (int) $value;
}

$db = null;
try {
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=require',
        $url['host'], (int) ($url['port'] ?? 5432), rawurldecode(ltrim($url['path'], '/')));
    $db = new PDO($dsn, rawurldecode($url['user']), rawurldecode($url['pass']), [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 8,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('BEGIN READ ONLY');
    $db->exec("SET LOCAL statement_timeout = '10s'");

    $captured = new DateTimeImmutable((string) row($db, 'SELECT CURRENT_TIMESTAMP AS now')['now']);
    $captured = $captured->setTimezone(new DateTimeZone('UTC'));
    $users = columns($db, 'users');
    $sessions = columns($db, 'vibyra_sessions');
    $turns = columns($db, 'vibes_turns');
    $events = columns($db, 'analytics_events');
    $consents = columns($db, 'analytics_consents');
    $canUsers = hasColumns($users, ['guest_at', 'created_at']);
    $canSessions = hasColumns($sessions, ['user_id', 'last_used_at']);
    $canTurns = hasColumns($turns, ['created_at', 'status', 'actual_micro_usd', 'model']);
    $canMemberships = hasColumns($users, ['guest_at', 'plan']);
    $canEvents = hasColumns($events, ['surface', 'event', 'dimension', 'platform', 'provider',
        'project_kind', 'screen', 'effort', 'user_id', 'visitor_hash', 'consent_subject_hash',
        'country_code', 'engaged_seconds',
        'occurred_at', 'created_at']);
    $canConsents = hasColumns($consents, ['surface', 'choice']);
    $tracking = ['website' => null, 'desktop' => null, 'mobile' => null];
    $lastEvent = $tracking;
    if ($canEvents) {
        foreach (rows($db, 'SELECT surface, MIN(created_at) AS started_at,
            MAX(created_at) AS last_at FROM analytics_events
            WHERE surface IN (\'website\', \'desktop\', \'mobile\') GROUP BY surface') as $item) {
            $tracking[$item['surface']] = $item['started_at'];
            $lastEvent[$item['surface']] = $item['last_at'];
        }
    }
    $consentChoices = $canConsents ? array_map(static fn (array $item): array => [
        'surface' => $item['surface'], 'choice' => $item['choice'], 'count' => (int) $item['count'],
    ], rows($db, 'SELECT surface, choice, COUNT(*) AS count FROM analytics_consents
        GROUP BY surface, choice ORDER BY surface, choice')) : null;

    $accountTotals = $canUsers
        ? row($db, 'SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE guest_at IS NULL) AS registered, COUNT(*) FILTER (WHERE guest_at IS NOT NULL) AS guests FROM users')
        : [];
    $active30d = $canSessions
        ? (int) row($db, 'SELECT COUNT(DISTINCT user_id) AS total FROM vibyra_sessions WHERE last_used_at >= ?',
            [$captured->modify('-30 days')->format('Y-m-d H:i:s')])['total']
        : null;
    $memberships = $canMemberships
        ? array_map(static fn (array $item): array => ['plan' => $item['plan'], 'count' => (int) $item['count']],
            rows($db, 'SELECT plan, COUNT(*) AS count FROM users WHERE guest_at IS NULL GROUP BY plan ORDER BY count DESC, plan'))
        : [];

    $periods = [];
    foreach ([7, 30, 90] as $days) {
        $from = $captured->setTime(0, 0)->modify('-'.($days - 1).' days');
        $bounds = [$from->format('Y-m-d H:i:s'), $captured->format('Y-m-d H:i:s')];
        $newUsers = $canUsers
            ? (int) row($db, 'SELECT COUNT(*) AS total FROM users WHERE created_at BETWEEN ? AND ?', $bounds)['total']
            : null;
        $turnTotals = $canTurns
            ? row($db, "SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed, COUNT(*) FILTER (WHERE status = 'failed') AS failed, COALESCE(SUM(actual_micro_usd), 0) AS spend FROM vibes_turns WHERE created_at BETWEEN ? AND ?", $bounds)
            : [];
        $models = $canTurns
            ? array_map(static fn (array $item): array => ['model' => $item['model'], 'count' => (int) $item['count']],
                rows($db, 'SELECT model, COUNT(*) AS count FROM vibes_turns WHERE created_at BETWEEN ? AND ? GROUP BY model ORDER BY count DESC, model LIMIT 12', $bounds))
            : [];

        $periods[(string) $days] = [
            'range' => ['days' => $days, 'from' => $from->format('Y-m-d\TH:i:s\Z'), 'to' => $captured->format('Y-m-d\TH:i:s\Z')],
            'accounts' => [
                'total' => nullableInt($accountTotals['total'] ?? null),
                'registered' => nullableInt($accountTotals['registered'] ?? null),
                'guests' => nullableInt($accountTotals['guests'] ?? null),
                'new' => $newUsers,
                'active_30d' => $active30d,
            ],
            'ai' => [
                'vibes_turns' => nullableInt($turnTotals['total'] ?? null),
                'completed_turns' => nullableInt($turnTotals['completed'] ?? null),
                'failed_turns' => nullableInt($turnTotals['failed'] ?? null),
                'spend_micro_usd' => nullableInt($turnTotals['spend'] ?? null),
            ],
            'memberships' => $memberships,
            'prompt_models' => $models,
            'operations' => productionOperations($db, $from, $captured,
                $canUsers, $canSessions, $canTurns),
            'cloud_series' => productionCloudSeries($db, $from, $captured, $canTurns),
            'analytics' => $canEvents ? productionAnalytics($db, $from, $captured, $tracking) : null,
        ];
    }
    $db->exec('COMMIT');

    $snapshot = [
        'schema_version' => 2,
        'captured_at' => $captured->format('Y-m-d\TH:i:s\Z'),
        'source' => 'production',
        'availability' => [
            'accounts' => $canUsers,
            'sessions' => $canSessions,
            'vibes_turns' => $canTurns,
            'memberships' => $canMemberships,
            'website_tracking' => (bool) $tracking['website'],
            'desktop_tracking' => (bool) $tracking['desktop'],
            'mobile_tracking' => (bool) $tracking['mobile'],
        ],
        'tracking_by_surface' => $tracking,
        'last_event_by_surface' => $lastEvent,
        'current_consent_choices' => $consentChoices,
        'periods' => $periods,
    ];
    $path = dirname(__DIR__).'/storage/app/private/owner-analytics-production.json';
    $json = json_encode($snapshot, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)."\n";
    umask(0077);
    $temporary = tempnam(dirname($path), '.owner-analytics-');
    if ($temporary === false || file_put_contents($temporary, $json, LOCK_EX) === false
        || !chmod($temporary, 0600) || !rename($temporary, $path)) {
        throw new RuntimeException('Could not write snapshot');
    }
    echo "Updated private owner analytics snapshot: {$path}\n";
} catch (Throwable $error) {
    if ($db instanceof PDO && $db->inTransaction()) {
        $db->rollBack();
    }
    fwrite(STDERR, 'Owner analytics export failed ('.$error::class.").\n");
    exit(1);
}
