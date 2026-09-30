<?php

declare(strict_types=1);

function productionOperations(PDO $db, DateTimeImmutable $from, DateTimeImmutable $to,
    bool $canUsers, bool $canSessions, bool $canTurns): array
{
    $bounds = [$from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')];
    $usedSince = static fn (int $days): string => $to->modify("-{$days} days")->format('Y-m-d H:i:s');
    $lastTurn = $canTurns ? row($db, 'SELECT MAX(created_at) AS last_at FROM vibes_turns')['last_at'] : null;

    return [
        'accounts_used_24h' => $canSessions ? (int) row($db,
            'SELECT COUNT(DISTINCT user_id) AS total FROM vibyra_sessions WHERE last_used_at >= ?',
            [$usedSince(1)])['total'] : null,
        'accounts_used_7d' => $canSessions ? (int) row($db,
            'SELECT COUNT(DISTINCT user_id) AS total FROM vibyra_sessions WHERE last_used_at >= ?',
            [$usedSince(7)])['total'] : null,
        'cloud_users' => $canTurns ? (int) row($db,
            'SELECT COUNT(DISTINCT user_id) AS total FROM vibes_turns WHERE created_at BETWEEN ? AND ?',
            $bounds)['total'] : null,
        'new_registered' => $canUsers ? (int) row($db,
            'SELECT COUNT(*) AS total FROM users WHERE guest_at IS NULL AND created_at BETWEEN ? AND ?',
            $bounds)['total'] : null,
        'cloud_last_turn_at' => $lastTurn
            ? (new DateTimeImmutable($lastTurn, new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z') : null,
    ];
}

function productionCloudSeries(PDO $db, DateTimeImmutable $from, DateTimeImmutable $to,
    bool $canTurns): ?array
{
    if (! $canTurns) {
        return null;
    }
    $counts = [];
    foreach (rows($db, 'SELECT DATE(created_at) AS day, COUNT(*) AS turns,
        COUNT(DISTINCT user_id) AS users FROM vibes_turns
        WHERE created_at BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY day',
        [$from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')]) as $item) {
        $counts[$item['day']] = $item;
    }
    $series = [];
    for ($day = $from; $day <= $to; $day = $day->modify('+1 day')) {
        $date = $day->format('Y-m-d');
        $series[] = ['date' => $date, 'turns' => (int) ($counts[$date]['turns'] ?? 0),
            'users' => (int) ($counts[$date]['users'] ?? 0)];
    }

    return $series;
}
