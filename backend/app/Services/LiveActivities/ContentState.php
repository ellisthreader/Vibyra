<?php
namespace App\Services\LiveActivities;

/**
 * Maps an Agent run to the one small, fixed Live Activity content-state the iPhone
 * widget decodes (mobile/modules/vibyra-activity RunPhase / RunPhrase; shared JSON
 * fixtures in tests/Fixtures/live-activity are decoded by a Swift test).
 *
 * Privacy: the lock screen is visible to other people, so the payload never holds a
 * tool argument, file name, prompt, answer or recipient. A phrase comes from a fixed
 * set and only when the person turned on "Show details".
 */
final class ContentState
{
    public const PHASES = ['queued', 'working', 'waiting_computer', 'needs_approval', 'needs_signin', 'paused', 'finished', 'failed'];
    public const PHRASES = ['thinking', 'reading', 'acting', 'unconfirmed'];

    /** run state => phase. `cancelled` has none: the activity is simply removed. */
    private const PHASE = [
        'queued' => 'queued', 'waiting_for_computer' => 'waiting_computer', 'starting' => 'working', 'running' => 'working',
        'waiting_for_tool' => 'working', 'waiting_for_approval' => 'needs_approval', 'waiting_for_signin' => 'needs_signin',
        'paused_by_limits' => 'paused', 'completed' => 'finished', 'failed' => 'failed', 'outcome_unknown' => 'failed',
    ];

    public static function phase(string $runState): ?string
    {
        return self::PHASE[$runState] ?? null;
    }

    public static function isEnd(?string $phase): bool
    {
        return $phase === 'finished' || $phase === 'failed';
    }

    /** The phase a person has to act on; these alert and use priority 10. */
    public static function needsPerson(?string $phase): bool
    {
        return $phase === 'needs_approval' || $phase === 'needs_signin';
    }

    /**
     * @param array{state:string,since:?int,finished_at:?int,tool_kind:?string} $run
     * @return ?array content-state, or null when the run state has no card (cancelled)
     */
    public static function for(array $run, bool $details, ?string $project = null, ?int $now = null): ?array
    {
        $phase = self::phase($run['state']);
        if ($phase === null) return null;
        $now ??= time();
        $since = (int) ($run['since'] ?? $now);
        $state = ['phase' => $phase, 'since' => $since];
        if ($details) {
            $phrase = self::phrase($run);
            if ($phrase !== null) $state['phrase'] = $phrase;
            if ($project !== null && $project !== '') $state['project'] = mb_substr($project, 0, 40);
        }
        if (self::isEnd($phase)) {
            $state['endedAt'] = (int) ($run['finished_at'] ?? $now);
            // An unconfirmed outcome says so with or without details: a bare "could not finish" would be a lie.
            if ($run['state'] === 'outcome_unknown') $state['phrase'] = 'unconfirmed';
        }
        return $state;
    }

    private static function phrase(array $run): ?string
    {
        if ($run['state'] === 'running' || $run['state'] === 'starting') return 'thinking';
        if ($run['state'] === 'waiting_for_tool') return match ($run['tool_kind'] ?? null) { 'write' => 'acting', 'read' => 'reading', default => 'thinking' };
        return null;
    }
}
