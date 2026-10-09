<?php
namespace App\Services\AgentWork\Proposals;

use App\Models\AgentV2\{Run, WorkProposal};
use App\Services\AgentRuns\{ApiError, Canonical, Grants};
use App\Services\AgentWork\Activations;
use Illuminate\Support\Facades\DB;

final class Proposals
{
    public static function enabled(): void { Activations::enabled(); }

    /** Called only inside the leased Broker transaction; lock order run → proposal quota. */
    public function create(Run $run, string $kind, array $spec): WorkProposal
    {
        self::enabled();
        app(Grants::class)->agent($run->user_id, $run->agent_id);
        if ($kind === 'workflow') $spec = \App\Services\AgentCoordination\WorkflowDraft::bind($run, $spec);
        $spec = ProposalSpecs::normalize($kind, $spec, $run->agent_id, $run->runtime_binding_id);
        DB::table('agent_work_proposal_quotas')->insertOrIgnore(['agent_id' => $run->agent_id, 'user_id' => $run->user_id, 'count' => 0]);
        $quota = DB::table('agent_work_proposal_quotas')->where('agent_id', $run->agent_id)->lockForUpdate()->first();
        abort_unless($quota && $quota->user_id == $run->user_id, 404);
        abort_if(WorkProposal::where('agent_id', $run->agent_id)->where('status', 'draft')->where('expires_at', '>', now())->count() >= 100,
            422, 'Review or discard some existing work proposals first.');
        return WorkProposal::create(['user_id' => $run->user_id, 'agent_id' => $run->agent_id, 'run_id' => $run->id,
            'runtime_id' => $run->runtime_binding_id, 'runtime_snapshot' => [...$run->runtime_snapshot,
                'accountLabel' => \App\Services\AgentWork\RuntimePins::label($run->runtime_snapshot),
                'workAgentId' => $run->agent_id, 'skillsHash' => \App\Services\AgentWork\SkillSnapshots::runHash($run),
                ...($kind === 'workflow' ? ['coordination' => \App\Services\AgentCoordination\WorkflowDraft::reviewContext($run)] : [])],
            'kind' => $kind, 'spec' => $spec, 'revision' => 1, 'status' => 'draft', 'expires_at' => now()->addDays(7)]);
    }

    public function find(int $userId, string $id, bool $lock = false): WorkProposal
    {
        $p = WorkProposal::where('user_id', $userId)->whereKey($id)->when($lock, fn ($q) => $q->lockForUpdate())->first();
        if (!$p) ApiError::throw(404, 'proposal_not_found', 'That proposal does not exist.');
        return $p;
    }

    public function list(int $userId, ?string $agentId, ?string $runId): array
    {
        return WorkProposal::where('user_id', $userId)->when($agentId, fn ($q) => $q->where('agent_id', $agentId))
            ->when($runId, fn ($q) => $q->where('run_id', $runId))->orderByDesc('created_at')->orderBy('id')->limit(100)
            ->get()->map(fn ($p) => $this->payload($p))->all();
    }

    public static function hash(WorkProposal $p): string
    {
        return Canonical::hash(['id' => $p->id, 'userId' => $p->user_id, 'agentId' => $p->agent_id, 'runId' => $p->run_id,
            'runtimeId' => $p->runtime_id, 'runtime' => $p->runtime_snapshot, 'kind' => $p->kind, 'spec' => $p->spec,
            'revision' => $p->revision, 'expiresAt' => $p->expires_at->toIso8601String()]);
    }

    public function payload(WorkProposal $p): array
    {
        return ['id' => $p->id, 'agentId' => $p->agent_id, 'runId' => $p->run_id, 'runtimeId' => $p->runtime_id,
            'runtime' => $p->runtime_snapshot, 'kind' => $p->kind, 'title' => $p->spec['title'] ?? $p->spec['name'],
            'spec' => $p->spec, 'revision' => $p->revision, 'reviewHash' => self::hash($p),
            'status' => $p->status === 'draft' && !$p->expires_at->isFuture() ? 'expired' : $p->status,
            'expiresAt' => $p->expires_at->toIso8601String(), 'activation' => $p->activation,
            'createdAt' => $p->created_at?->toIso8601String(), 'updatedAt' => $p->updated_at?->toIso8601String()];
    }
}
