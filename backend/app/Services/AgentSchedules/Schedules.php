<?php

namespace App\Services\AgentSchedules;

use App\Models\AgentV2\Occurrence;
use App\Models\AgentV2\Run;
use App\Models\AgentV2\RuntimeBinding;
use App\Models\AgentV2\Schedule;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Grants;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Saved routines. An edit bumps the revision (occurrences of an older revision are never
 * admitted again) and recalculates the next run from now; pause and delete stop future
 * occurrences. History (occurrences, runs) stays readable after delete.
 */
final class Schedules
{
    private const EDITABLE = ['title', 'prompt', 'timezone', 'recurrence', 'runtimeId', 'catchUpMinutes', 'overlap'];

    public function __construct(private readonly Grants $grants) {}

    public function create(int $userId, array $data): Schedule
    {
        $agent = $this->grants->agent($userId, $data['agentId']);
        if (Schedule::query()->where('user_id', $userId)->whereNull('deleted_at')->count() >= (int) config('agents_v2.max_schedules', 50))
            ApiError::throw(409, 'schedule_limit', 'This account has the most routines it can keep. Delete one first.');
        $values = $this->values($userId, $data);
        $next = Recurrence::next($values['recurrence'], $values['timezone'], CarbonImmutable::now());
        if (!$next) ApiError::throw(422, 'no_future_run', 'That time has already passed.');
        return Schedule::query()->create([...$values, 'user_id' => $userId, 'agent_id' => $agent->id,
            'conversation_id' => $agent->chat_id, 'revision' => 1, 'next_run_at' => $next]);
    }

    public function update(int $userId, string $id, array $data): Schedule
    {
        return DB::transaction(function () use ($userId, $id, $data) {
            $schedule = $this->find($userId, $id, true);
            if ((int) $data['revision'] !== $schedule->revision)
                ApiError::throw(409, 'stale_revision', 'This routine changed elsewhere. Reload it and try again.');
            $current = ['title' => $schedule->title, 'prompt' => $schedule->prompt, 'timezone' => $schedule->timezone,
                'recurrence' => $schedule->recurrence, 'runtimeId' => $schedule->runtime_binding_id,
                'catchUpMinutes' => $schedule->catch_up_minutes, 'overlap' => $schedule->overlap];
            $values = $this->values($userId, [...$current, ...array_intersect_key($data, array_flip(self::EDITABLE))]);
            $next = Recurrence::next($values['recurrence'], $values['timezone'], CarbonImmutable::now());
            if (!$next && $values['recurrence']['type'] === 'once') ApiError::throw(422, 'no_future_run', 'That time has already passed.');
            $schedule->forceFill([...$values, 'revision' => $schedule->revision + 1,
                'next_run_at' => $schedule->paused_at ? null : $next])->save();
            \App\Services\AgentWork\Routines::reviewUpdate($schedule, array_key_exists('runtimeId', $data));
            return $schedule;
        });
    }

    public function pause(int $userId, string $id, bool $paused): Schedule
    {
        return DB::transaction(function () use ($userId, $id, $paused) {
            $schedule = $this->find($userId, $id, true);
            if ($paused === ($schedule->paused_at !== null)) return $schedule;
            // Resuming never back-fills the paused period: the next run is computed from now.
            $schedule->forceFill(['paused_at' => $paused ? now() : null, 'next_run_at' => $paused ? null
                : Recurrence::next($schedule->recurrence, $schedule->timezone, CarbonImmutable::now())])->save();
            return $schedule;
        });
    }

    public function delete(int $userId, string $id): void
    {
        $schedule = $this->find($userId, $id);
        $schedule->forceFill(['deleted_at' => now(), 'next_run_at' => null])->save();
    }

    public function find(int $userId, string $id, bool $lock = false): Schedule
    {
        $query = Schedule::query()->where('user_id', $userId)->whereKey($id)->whereNull('deleted_at');
        $schedule = ($lock ? $query->lockForUpdate() : $query)->first();
        if (!$schedule) ApiError::throw(404, 'schedule_not_found', 'That routine does not exist.');
        return $schedule;
    }

    /** @return Schedule[] */
    public function list(int $userId, ?string $agentId): array
    {
        return Schedule::query()->where('user_id', $userId)->whereNull('deleted_at')
            ->when($agentId, fn ($q) => $q->where('agent_id', $agentId))->orderBy('created_at')->limit(100)->get()->all();
    }

    /** @return Occurrence[] newest first */
    public function occurrences(int $userId, string $id, int $limit): array
    {
        $schedule = Schedule::query()->where('user_id', $userId)->whereKey($id)->first();
        if (!$schedule) ApiError::throw(404, 'schedule_not_found', 'That routine does not exist.');
        return Occurrence::query()->where('schedule_id', $schedule->id)->orderByDesc('intended_at')
            ->limit(max(1, min(100, $limit)))->get()->all();
    }

    public function payload(Schedule $s): array
    {
        $runtime = $s->runtime_binding_id ? \App\Models\AgentV2\RuntimeBinding::whereKey($s->runtime_binding_id)
            ->where('user_id', $s->user_id)->first() : null;
        return ['id' => $s->id, 'agentId' => $s->agent_id, 'conversationId' => $s->conversation_id, 'title' => $s->title,
            'prompt' => $s->prompt, 'timezone' => $s->timezone, 'recurrence' => $s->recurrence,
            'description' => Recurrence::describe($s->recurrence), 'revision' => $s->revision,
            'runtimeId' => $s->runtime_binding_id, 'executionTarget' => $runtime?->execution_target ?? 'local',
            'accountLabel' => $runtime?->execution_target === 'cloud' ? 'Claude Cloud account' : null,
            'catchUpMinutes' => $s->catch_up_minutes, 'overlap' => $s->overlap,
            'paused' => $s->paused_at !== null, 'nextRunAt' => $s->next_run_at?->toIso8601String(),
            'nextRunLocal' => $s->next_run_at?->setTimezone($s->timezone)->toIso8601String(),
            'createdAt' => $s->created_at?->toIso8601String(), 'updatedAt' => $s->updated_at?->toIso8601String()];
    }

    public function occurrencePayload(Occurrence $o): array
    {
        $run = $o->run_id ? Run::query()->whereKey($o->run_id)->first(['id', 'state']) : null;
        return ['id' => $o->id, 'scheduleId' => $o->schedule_id, 'revision' => $o->revision,
            'intendedAt' => $o->intended_at?->toIso8601String(), 'state' => $o->state, 'reason' => $o->reason,
            'runId' => $o->run_id, 'runState' => $run?->state, 'createdAt' => $o->created_at?->toIso8601String()];
    }

    private function values(int $userId, array $data): array
    {
        $timezone = Recurrence::zone($data['timezone'] ?? null);
        $recurrence = Recurrence::normalize($data['recurrence'] ?? null, $timezone);
        $prompt = (string) ($data['prompt'] ?? '');
        if (trim($prompt) === '') ApiError::throw(422, 'empty_prompt', 'Write what the routine should do.');
        $runtime = $data['runtimeId'] ?? null;
        if ($runtime && !RuntimeBinding::query()->where('user_id', $userId)->whereKey($runtime)->whereNull('revoked_at')->exists())
            ApiError::throw(404, 'runtime_not_found', 'That AI account binding does not exist.');
        return ['title' => $data['title'] ?? null, 'prompt' => $prompt, 'timezone' => $timezone, 'recurrence' => $recurrence,
            'runtime_binding_id' => $runtime, 'overlap' => $data['overlap'] ?? 'skip',
            'catch_up_minutes' => (int) ($data['catchUpMinutes'] ?? config('agents_v2.schedule_catch_up_minutes', 60))];
    }
}
