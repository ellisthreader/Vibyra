<?php

namespace App\Services\AgentRuns\Jobs;

use App\Models\AgentV2\{Job, Run};
use App\Services\AgentRuns\{Canonical, Memory\Recall, Memory\Scope, RunStates};
use Illuminate\Support\Facades\DB;

/** Each independent job sees only history that existed when it was admitted. */
final class Contexts
{
    public static function mode(Run $run): string
    {
        return Job::query()->whereKey($run->id)->value('mode') ?? 'ordered';
    }

    public static function capture(Run $run, string $mode, object $agent): void
    {
        if (!AccountLock::enabled($run->user_id)) return;
        $context = null;
        if ($mode !== 'ordered') {
            $coordinated = $mode === 'coordinated';
            $context = ['name' => $agent->name, 'brief' => $agent->brief,
                'history' => $coordinated ? [] : self::history($run),
                'memory' => $coordinated ? '' : app(Recall::class)->text($run, $agent->memory ?? null),
                'memoryBoundary' => $coordinated ? null : self::memoryBoundary($run, $agent->memory ?? null)];
        }
        Job::query()->create(['run_id' => $run->id, 'user_id' => $run->user_id, 'mode' => $mode,
            'write_epoch' => (int) DB::table('agent_job_accounts')->where('user_id', $run->user_id)->value('write_epoch'),
            'context' => $context]);
    }

    public static function history(Run $run): array
    {
        $rows = Run::query()->where('agent_id', $run->agent_id)->where('user_id', $run->user_id)
            ->where('state', RunStates::COMPLETED)->where('conversation_seq', '<', $run->conversation_seq)
            ->whereNotIn('id', Job::query()->where('mode', 'coordinated')->select('run_id'))
            ->orderByDesc('conversation_seq')->limit(10)->get(['id', 'prompt', 'answer'])->reverse()->values();
        return app(Recall::class)->history($run, $rows->map(fn ($row) => [
            'runId' => $row->id, 'prompt' => mb_substr($row->prompt, 0, 4000),
            'answer' => mb_substr((string) $row->answer, 0, 8000)])->all());
    }

    public static function forClaim(Run $run): ?array
    {
        $job = Job::query()->find($run->id);
        if (!$job?->context) return null;
        $context = $job->context;
        $memory = DB::table('agent_teammates')->where('id', $run->agent_id)->value('memory');
        if ($job->mode === 'coordinated' || !hash_equals((string) ($context['memoryBoundary'] ?? ''), self::memoryBoundary($run, $memory)))
            $context['memory'] = ''; // Forgetting/expiry may remove facts; an old snapshot must not restore them.
        $context['history'] = app(Recall::class)->history($run, $context['history'] ?? []);
        return $context;
    }

    private static function memoryBoundary(Run $run, ?string $legacy): string
    {
        $facts = Scope::query((int) $run->user_id, $run->agent_id, Scope::hash($run->runtime_snapshot ?? []))
            ->where('status', 'active')->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderBy('id')->get(['id', 'updated_at', 'invalidated_at', 'fact'])->toArray();
        return Canonical::hash(['legacy' => $legacy, 'facts' => $facts]);
    }
}
