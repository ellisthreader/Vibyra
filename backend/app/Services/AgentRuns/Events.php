<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;
use App\Models\AgentV2\RunEvent;
use App\Services\AgentRuns\Tools\ToolProviders;
use Illuminate\Support\Facades\DB;

/**
 * The run journal. Each append takes the run row lock, so `seq` is gap-free and
 * monotonic per run. Payloads are redacted and size-bounded before storage.
 */
final class Events
{
    /** Hook points for notification delivery (Phase 3 consumes these). */
    public const NOTIFY = ['run.completed', 'run.waiting_approval', 'run.waiting_signin', 'run.failed'];
    private const TOOL_EVENTS = ['tool.requested', 'tool.result', 'tool.refused', 'approval.requested'];
    private ?ToolProviders $providers = null;
    private const SECRET_KEYS = ['credential', 'token', 'access_token', 'refresh_token', 'authorization',
        'password', 'secret', 'runnerkey', 'cookie', 'api_key', 'apikey'];

    public function append(Run $run, string $type, array $payload = [], string $source = 'server'): RunEvent
    {
        return DB::transaction(function () use ($run, $type, $payload, $source) {
            $locked = Run::query()->whereKey($run->id)->lockForUpdate()->firstOrFail();
            $seq = $locked->event_seq + 1;
            $locked->forceFill(['event_seq' => $seq])->save();
            $run->event_seq = $seq;
            $run->syncOriginalAttribute('event_seq');
            return RunEvent::query()->create(['run_id' => $run->id, 'seq' => $seq, 'type' => $type,
                'payload' => $this->bounded($this->redact(SafeUrl::scrub($payload))), 'source' => $source, 'created_at' => now()]);
        });
    }

    /** Says once per run that something was dropped to keep the journal bounded (F-13); this marker is never itself dropped. */
    public function truncated(Run $run, string $what): void
    {
        if (RunEvent::query()->where('run_id', $run->id)->where('type', 'journal.truncated')->exists()) return;
        $this->append($run, 'journal.truncated', ['dropped' => $what]);
    }

    /** @return array{events: array, nextCursor: int} */
    public function after(Run $run, int $cursor, int $limit): array
    {
        $rows = RunEvent::query()->where('run_id', $run->id)->where('seq', '>', max(0, $cursor))
            ->orderBy('seq')->limit(max(1, min(200, $limit)))->get();
        return ['events' => $rows->map(fn (RunEvent $e) => $this->payload($e, (int) $run->user_id))->all(),
            'nextCursor' => (int) ($rows->last()?->seq ?? max(0, $cursor))];
    }

    /** Tool events carry `provider` (added on read, so older journal rows have it too). */
    public function payload(RunEvent $e, ?int $userId = null): array
    {
        $payload = $e->payload ?? [];
        if (in_array($e->type, self::TOOL_EVENTS, true) && is_string($payload['tool'] ?? null) && !array_key_exists('provider', $payload))
            $payload['provider'] = ($this->providers ??= app(ToolProviders::class))->of($payload['tool'],
                $e->type === 'tool.refused' ? null : ($payload['connectionId'] ?? null), $userId);
        return ['seq' => $e->seq, 'type' => $e->type, 'payload' => (object) $payload,
            'source' => $e->source, 'createdAt' => $e->created_at?->toIso8601String()];
    }

    private function redact(array $payload): array
    {
        foreach ($payload as $key => $value) {
            $normalized = strtolower(str_replace(['-', ' '], '_', (string) $key));
            if (in_array(str_replace('_', '', $normalized), array_map(fn ($k) => str_replace('_', '', $k), self::SECRET_KEYS), true)) {
                $payload[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $payload[$key] = $this->redact($value);
            }
        }
        return $payload;
    }

    private function bounded(array $payload): array
    {
        $limit = (int) config('agents_v2.max_event_bytes', 8000);
        if (strlen(json_encode($payload)) <= $limit) return $payload;
        foreach (['text', 'answer', 'summary', 'reason'] as $key) {
            if (is_string($payload[$key] ?? null)) $payload[$key] = mb_strcut($payload[$key], 0, (int) ($limit / 2));
        }
        if (strlen(json_encode($payload)) > $limit) $payload = array_intersect_key($payload, array_flip(['actionId', 'callId', 'tool']));
        return [...$payload, 'truncated' => true];
    }
}
