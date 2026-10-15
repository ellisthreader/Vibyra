<?php
namespace App\Services\CloudComputer\Activity;

use App\Services\CloudWorkspaces\Git\CloudEvents;
use App\Services\LiveActivities\CloudHostCards;
use Illuminate\Support\Carbon;

/**
 * What a stored phase event may start (docs/cloud-switching-contract.md section 2), each behind its own flag and off by
 * default: an attention push through the existing inbox (HOST_NOTIFICATION_EVENTS_ENABLED + WORK_PROGRESS_EVENTS_ENABLED)
 * and a Live Activity card (LIVE_ACTIVITIES_ENABLED). Best effort: a failure here never fails the Host's report.
 */
class Fanout
{
    /** Only something that just happened is worth a push; a Host catching up after a gap is silent. */
    public const FRESH_SECONDS = 600;

    private const PUSH = ['waiting' => 'approval.needed', 'finished' => 'task.finished', 'failed' => 'task.failed'];
    private const NAMES = ['claude' => 'Claude', 'codex' => 'Codex', 'gemini' => 'Gemini'];

    /** @param list<array> $events what HostEvents::ingest stored */
    public function run(object $workspace, array $events): void
    {
        if (!$events) return;
        // Ingest may have committed before a withdrawal. Recheck before queueing any notification or card.
        try {
            app(EventAuthority::class)->withCurrent($workspace, fn ($w) => $this->current($w, $events));
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException|\Illuminate\Http\Exceptions\HttpResponseException) {
            // Access changed after ingest: stored history must not create a new attention signal.
        }
    }

    private function current(object $workspace, array $events): void
    {
        foreach ($events as $e) {
            if (!app(EventAuthority::class)->allowsProject($workspace, $e['project'])) continue;
            // A late `stopped` is still delivered: it is silent and only ends a card that is showing work (never pushes).
            if ($e['phase'] !== 'stopped' && Carbon::parse($e['at'])->lt(now()->subSeconds(self::FRESH_SECONDS))) continue;
            try { $this->push($workspace, $e); } catch (\Throwable $error) { report($error); }
            try { app(CloudHostCards::class)->onPhase($e); } catch (\Throwable $error) { report($error); }
        }
    }

    private function push(object $workspace, array $e): void
    {
        if (!config('intelligence.host_events') || !config('intelligence.events')) return;
        $type = self::PUSH[$e['phase']] ?? null;
        if ($type === null) return;
        $name = self::NAMES[$e['provider']] ?? 'Your agent';
        $body = match ($e['phase']) {
            'waiting' => 'Waiting for your approval in '.$e['project'].'.',
            'finished' => 'Finished in '.$e['project'].'.',
            default => 'Stopped with an error in '.$e['project'].'.',
        };
        // The throttle is per conversation: two chats finishing together are both worth a tap.
        app(CloudEvents::class)->send($workspace, $type, $e['title'] ?? $name.' conversation', $body, null,
            ['agentSession' => ['provider' => $e['provider'], 'id' => $e['id']], 'project' => $e['project']], substr(sha1($e['provider'].':'.$e['id']), 0, 16));
    }
}
