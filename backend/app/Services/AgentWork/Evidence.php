<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Output, Run};
use Illuminate\Support\Facades\DB;

/** Evidence is resolved from the exact owned task, never accepted from a model or client. */
final class Evidence
{
    public static function from(?Run $run, int $userId, string $agentId): ?array
    {
        if (!$run || (int) $run->user_id !== $userId || $run->agent_id !== $agentId || $run->state !== 'completed' || !$run->finished_at) return null;
        $ids = Output::query()->where('user_id', $userId)->where('agent_id', $agentId)
            ->whereIn('id', DB::table('agent_output_revisions')->where('run_id', $run->id)->select('output_id'))
            ->orderBy('id')->limit(100)->pluck('id')->all();
        if (trim((string) $run->answer) === '' && $ids === []) return null;
        return ['runId' => $run->id, 'answer' => mb_substr((string) $run->answer, 0, 2000),
            'outputIds' => $ids, 'finishedAt' => $run->finished_at->toIso8601String()];
    }
}
