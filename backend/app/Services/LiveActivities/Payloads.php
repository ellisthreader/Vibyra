<?php
namespace App\Services\LiveActivities;

/**
 * The APNs `aps` dictionaries for a Live Activity. Everything here is small: the whole
 * payload stays far under ActivityKit's 4 KB limit (a test pins it).
 */
final class Payloads
{
    /** Higher shows first in the island and on the lock screen. */
    private const RELEVANCE = ['needs_approval' => 100, 'needs_signin' => 100, 'failed' => 80, 'working' => 50, 'finished' => 40,
        'queued' => 30, 'waiting_computer' => 30, 'paused' => 30];

    /** @return array{0:array,1:int} payload and APNs priority (10 only when a person is needed or a run ended) */
    public static function update(array $content, string $teammate, ?int $now = null): array
    {
        $now ??= time();
        $phase = $content['phase'];
        if (ContentState::isEnd($phase)) return [self::end($content, $teammate, $now), 10];
        $aps = ['timestamp' => $now, 'event' => 'update', 'content-state' => $content,
            'stale-date' => $now + 60 * (int) config(ContentState::needsPerson($phase) ? 'live_activities.person_stale_minutes' : 'live_activities.stale_minutes'),
            'relevance-score' => self::RELEVANCE[$phase] ?? 30];
        if (ContentState::needsPerson($phase)) $aps['alert'] = self::alert($phase, $teammate);
        return [['aps' => $aps], ContentState::needsPerson($phase) ? 10 : 5];
    }

    /** The final state, with the dismissal rule: finished lingers about 15 minutes, failed until seen (system default). */
    public static function end(array $content, string $teammate, ?int $now = null): array
    {
        $now ??= time();
        $aps = ['timestamp' => $now, 'event' => 'end', 'content-state' => $content, 'relevance-score' => self::RELEVANCE[$content['phase']] ?? 30];
        if ($content['phase'] === 'finished') $aps['dismissal-date'] = $now + 60 * (int) config('live_activities.finished_minutes');
        if (in_array($content['phase'], ['finished', 'failed'], true)) $aps['alert'] = self::alert($content['phase'], $teammate);
        return ['aps' => $aps];
    }

    /** A cancelled run has nothing to show: end it and remove it at once. */
    public static function remove(array $content, ?int $now = null): array
    {
        $now ??= time();
        return ['aps' => ['timestamp' => $now, 'event' => 'end', 'content-state' => $content, 'dismissal-date' => $now - 1]];
    }

    /** Start a card on a phone that did not start the run (iOS 17.2+). The system requires an alert. */
    public static function start(array $content, array $attributes, ?int $now = null): array
    {
        $now ??= time();
        return ['aps' => ['timestamp' => $now, 'event' => 'start', 'content-state' => $content,
            'attributes-type' => (string) config('live_activities.attributes_type'), 'attributes' => $attributes,
            'stale-date' => $now + 60 * (int) config('live_activities.stale_minutes'), 'relevance-score' => 50,
            'alert' => ['title' => $attributes['name'].' is working', 'body' => 'Open Vibyra to follow along.']]];
    }

    /** Fixed strings. The teammate's name is already on the card, so it adds nothing new. */
    public static function alert(string $phase, string $teammate): array
    {
        $name = mb_substr($teammate, 0, 40);
        return match ($phase) {
            'needs_approval' => ['title' => "$name needs your approval", 'body' => 'Open Vibyra to review.', 'sound' => 'default'],
            'needs_signin' => ['title' => "$name needs you to sign in", 'body' => 'Open Vibyra to continue.', 'sound' => 'default'],
            'finished' => ['title' => "$name finished", 'body' => 'Open Vibyra to see the result.'],
            default => ['title' => "$name could not finish", 'body' => 'Open Vibyra to see what happened.', 'sound' => 'default'],
        };
    }

    public static function attributes(string $runId, string $agentId, string $name, string $avatar): array
    {
        return ['runId' => $runId, 'agentId' => $agentId, 'name' => mb_substr($name, 0, 40), 'avatar' => $avatar];
    }
}
