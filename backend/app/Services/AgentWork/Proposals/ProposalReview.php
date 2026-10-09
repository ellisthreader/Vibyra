<?php
namespace App\Services\AgentWork\Proposals;

use App\Models\{AgentV2\WorkProposal, User};
use App\Services\AgentRuns\{Access, ApiError, Grants};
use App\Services\AgentWork\{FollowUps, Goals, Routines, RuntimePins};
use App\Services\Membership\PlanLimits;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Account-only mutations. No runner route references this service. */
final class ProposalReview
{
    public function __construct(private readonly Proposals $proposals) {}

    public function edit(int $userId, string $id, int $revision, array $spec): WorkProposal
    {
        Proposals::enabled();
        return DB::transaction(function () use ($userId, $id, $revision, $spec) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            $p = $this->proposals->find($userId, $id, true);
            $this->draft($p, $revision);
            if ($p->kind === 'workflow') $spec = \App\Services\AgentCoordination\WorkflowDraft::edit($p, $spec);
            $normalized = ProposalSpecs::normalize($p->kind, $spec, $p->agent_id, $p->runtime_id);
            $p->forceFill(['spec' => $normalized, 'revision' => $p->revision + 1])->save();
            return $p;
        });
    }

    public function discard(int $userId, string $id, int $revision): WorkProposal
    {
        return DB::transaction(function () use ($userId, $id, $revision) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            $p = $this->proposals->find($userId, $id, true);
            $this->draft($p, $revision, false);
            $p->forceFill(['status' => 'discarded', 'revision' => $p->revision + 1])->save();
            return $p;
        });
    }

    public function accept(int $userId, string $id, int $revision, string $hash): WorkProposal
    {
        return DB::transaction(function () use ($userId, $id, $revision, $hash) {
            // Activation services serialize this owner's new saved work under the same user lock.
            \App\Services\AgentRuns\Jobs\AccountLock::lock($userId);
            $user = User::whereKey($userId)->lockForUpdate()->firstOrFail();
            $p = $this->proposals->find($userId, $id, true);
            if ($p->status === 'accepted') {
                if ($p->accepted_revision === $revision && hash_equals((string) $p->accepted_hash, $hash)) return $p;
                self::changed();
            }
            $this->draft($p, $revision);
            if (!hash_equals(Proposals::hash($p), $hash)) self::changed();
            Proposals::enabled(); app(Access::class)->require($userId);
            if (!app(PlanLimits::class)->allows($user, 'agents')) ApiError::throw(402, 'plan_required', 'Agents need Pro.');
            app(Grants::class)->agent($userId, $p->agent_id);
            $spec = ProposalSpecs::normalize($p->kind, $p->spec, $p->agent_id, $p->runtime_id);
            if ($p->kind === 'followup' && isset($spec['condition']['triggerId']))
                app(\App\Services\AgentWork\FollowUpSources::class)->source($userId, $p->agent_id, $spec['condition'], true);
            // Skills lock the wallet, before any runtime row; no compute or credits are consumed.
            if ($p->kind === 'skill') app(\App\Services\Vibes\Wallet::class)->lock($userId);
            if ($p->kind === 'workflow') \App\Services\AgentCoordination\WorkflowDraft::lockSource($userId, $spec);
            RuntimePins::require($userId, $p->runtime_snapshot);
            $bound = [...$spec, 'agentId' => $p->agent_id, 'runtimeId' => $p->runtime_id];
            $key = 'proposal:'.$p->id;
            $target = match ($p->kind) {
                'workflow' => app(\App\Services\AgentCoordination\Workflows::class)->activate($userId, $bound, $key),
                'goal' => app(Goals::class)->activate($userId, $bound, $key),
                'followup' => app(FollowUps::class)->activate($userId, $bound, $key),
                'routine' => app(Routines::class)->activate($userId, $bound, $key),
                'skill' => app(\App\Services\Agents\Skills::class)->save($userId, ['id' => (string) Str::uuid(), 'revision' => 0,
                    'name' => $spec['name'], 'instructions' => $spec['instructions'], 'teammateIds' => $spec['assignToAgent'] ? [$p->agent_id] : []]),
            };
            $p->forceFill(['status' => 'accepted', 'accepted_revision' => $revision, 'accepted_hash' => $hash,
                'activation' => ['kind' => $p->kind, 'id' => $target['id']], 'revision' => $p->revision + 1])->save();
            return $p;
        }, 3);
    }

    private function draft(WorkProposal $p, int $revision, bool $checkExpiry = true): void
    {
        if ($p->revision !== $revision || $p->status !== 'draft') self::changed();
        if ($checkExpiry && !$p->expires_at->isFuture()) ApiError::throw(409, 'proposal_expired', 'This proposal expired. Ask for a fresh draft.');
    }

    private static function changed(): never { ApiError::throw(409, 'proposal_changed', 'This proposal changed. Refresh before deciding.'); }
}
