<?php

namespace App\Services\Platform;

use App\Models\AgentV2\Run;
use App\Models\AgentV2\ToolAction;
use App\Models\User;
use App\Services\AgentRuns\{Access, Admission, ApiError, RunStates};
use App\Services\Membership\PlanLimits;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * What a personal API key (or the MCP server behind one) may read and start. Reads are narrower than the client API: no approval
 * fingerprints and no tool arguments, so a key can see that a write is waiting but has nothing to act on it with.
 */
final class PlatformRuns
{
    public function __construct(private readonly Admission $admission, private readonly Access $access) {}

    /** @return Run[] newest first */
    public function list(int $userId, ?string $agentId, int $limit): array
    {
        return Run::query()->where('user_id', $userId)->when($agentId, fn ($q) => $q->where('agent_id', $agentId))
            ->orderByDesc('created_at')->orderByDesc('id')->limit(max(1, min(50, $limit)))->get()->all();
    }

    public function find(int $userId, string $id): Run
    {
        $run = Str::isUuid($id) ? Run::query()->where('user_id', $userId)->whereKey($id)->first() : null;
        if (!$run) ApiError::throw(404, 'run_not_found', 'That run does not exist.');
        return $run;
    }

    /** Start a run on a teammate (the most recently used one when none is named), through the one admission every run uses. */
    public function start(User $user, ?string $agentId, string $prompt, ?string $idempotencyKey): array
    {
        $this->access->require($user->id);
        if (!app(PlanLimits::class)->allows($user, 'agents')) ApiError::throw(402, 'plan_required', \App\Http\Controllers\AgentsController::AGENTS_NEED_PRO);
        if (trim($prompt) === '' || mb_strlen($prompt) > (int) config('agents_v2.max_prompt_chars')) ApiError::throw(422, 'invalid_prompt', 'Write a task of reasonable length.');
        if ($idempotencyKey !== null && !preg_match('/^[A-Za-z0-9._:-]{8,100}$/D', $idempotencyKey)) ApiError::throw(422, 'invalid_idempotency_key', 'Use 8-100 letters, digits or . _ : -');
        $agentId ??= DB::table('agent_teammates')->where('user_id', $user->id)->whereNull('archived_at')->orderByDesc('updated_at')->value('id');
        if (!$agentId) ApiError::throw(409, 'no_teammate', 'Create a teammate in Vibyra first.');
        [$run, $created] = $this->admission->admit($user->id, ['agentId' => $agentId, 'prompt' => $prompt, 'attachments' => [],
            'runtimeId' => null, 'idempotencyKey' => 'api-'.($idempotencyKey ?? Str::uuid())]);
        return ['run' => $this->payload($run), 'replayed' => !$created];
    }

    public function payload(Run $run): array
    {
        $actions = ToolAction::query()->where('run_id', $run->id)->orderBy('created_at')->orderBy('id')->limit(50)->get();
        return ['id' => $run->id, 'agentId' => $run->agent_id, 'state' => $run->state, 'stateReason' => $run->state_reason,
            'terminal' => RunStates::terminal($run->state), 'needsApproval' => $run->state === RunStates::WAITING_APPROVAL,
            'prompt' => $run->prompt, 'answer' => $run->answer,
            'actions' => $actions->map(fn (ToolAction $a) => ['id' => $a->id, 'tool' => $a->tool, 'kind' => $a->kind, 'state' => $a->state, 'summary' => $a->summary])->all(),
            'createdAt' => $run->created_at?->toIso8601String(), 'startedAt' => $run->started_at?->toIso8601String(),
            'finishedAt' => $run->finished_at?->toIso8601String()];
    }

    /** The account's projects kept on its cloud computer (cloud sync); the only project list the backend holds. */
    public function projects(int $userId, int $limit = 50): array
    {
        return DB::table('cloud_sync_projects')->where('user_id', $userId)->whereNull('removed_at')->orderBy('name')->limit(max(1, min(100, $limit)))
            ->get(['project_key', 'name', 'state', 'up_synced_at'])->map(fn ($p) => ['id' => $p->project_key, 'name' => $p->name, 'state' => $p->state,
                'syncedAt' => $p->up_synced_at ? \Illuminate\Support\Carbon::parse($p->up_synced_at)->toIso8601String() : null])->all();
    }
}
