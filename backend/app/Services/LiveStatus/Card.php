<?php
namespace App\Services\LiveStatus;

/**
 * Pure rules: the Mac's names-only snapshot -> the computer card's content state, which must
 * decode as `VibyraComputerAttributes.ContentState` in Swift. Dates travel as seconds since
 * 2001 (ActivityKit's default JSON date strategy), counts and names as plain fields.
 */
final class Card
{
    /** Swift's reference date (2001-01-01) as a Unix time. */
    private const REFERENCE = 978307200;

    /** @param array{attention?:array,working?:array,recent?:array} $snap */
    public static function state(array $snap, int $now): array
    {
        $needs = array_values($snap['attention'] ?? []);
        $busy = array_values($snap['working'] ?? []);
        $top = $needs[0] ?? $busy[0] ?? null;
        return [
            'sessions' => count($needs) + count($busy),
            'throughCloud' => false,
            'checkedAt' => $now - self::REFERENCE,
            'working' => count($busy),
            'needs' => count($needs),
            'phase' => $needs ? 'needs' : ($busy ? 'working' : 'idle'),
            'headline' => $top ? self::text($top['title'] ?? '', 40) : null,
            'project' => $top && ($top['project'] ?? '') !== '' ? self::text($top['project'], 28) : null,
        ];
    }

    /** What the person would notice: everything but the time stamp. */
    public static function signature(array $state): string
    {
        unset($state['checkedAt']);
        return hash('sha256', json_encode($state));
    }

    /** The waiting item an alert was last raised for; a new one alerts again. */
    public static function alertKey(array $snap): ?string
    {
        $first = $snap['attention'][0] ?? null;
        return $first ? self::text($first['key'] ?? '', 120) : null;
    }

    public static function alert(array $state): array
    {
        $who = $state['headline'] ?? 'An agent';
        return ['title' => "$who needs you", 'body' => $state['project'] ? 'In '.$state['project'].'. Open Vibyra to answer.' : 'Open Vibyra to answer.',
            'sound' => 'default'];
    }

    public static function update(array $state, ?array $alert, int $now): array
    {
        $aps = ['timestamp' => $now, 'event' => 'update', 'content-state' => $state,
            'stale-date' => $now + 60 * (int) config('live_status.stale_minutes'),
            'relevance-score' => $state['phase'] === 'needs' ? 100 : 50];
        if ($alert) $aps['alert'] = $alert;
        return ['aps' => $aps];
    }

    /** iOS requires an alert to start a card from a push. */
    public static function start(array $state, string $macName, int $now): array
    {
        return ['aps' => ['timestamp' => $now, 'event' => 'start', 'content-state' => $state,
            'attributes-type' => (string) config('live_status.attributes_type'),
            'attributes' => ['scope' => 'mac', 'name' => self::text($macName, 40)],
            'stale-date' => $now + 60 * (int) config('live_status.stale_minutes'),
            'relevance-score' => $state['phase'] === 'needs' ? 100 : 50,
            'alert' => $state['phase'] === 'needs' ? self::alert($state)
                : ['title' => 'Agents are working on '.self::text($macName, 40), 'body' => 'Follow along on your Lock Screen.']]];
    }

    public static function end(array $state, int $now): array
    {
        return ['aps' => ['timestamp' => $now, 'event' => 'end', 'content-state' => $state, 'dismissal-date' => $now]];
    }

    /** One printable line, bounded. */
    public static function text(mixed $value, int $max): string
    {
        $line = trim((string) preg_replace('/\s+/u', ' ', preg_replace('/[\x00-\x1F\x7F]/u', ' ', (string) $value)));
        return mb_strlen($line) > $max ? rtrim(mb_substr($line, 0, $max - 1)).'…' : $line;
    }
}
