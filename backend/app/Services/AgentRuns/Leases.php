<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;
use App\Models\AgentV2\RuntimeBinding;
use App\Models\AgentV2\ToolAction;
use Illuminate\Support\Facades\DB;

/**
 * Fenced runner leases. Every claim increments `lease_generation`; every runner
 * write must present the current generation, so a runner that lost its lease
 * (timeout, takeover) cannot post events, tool calls or completion.
 */
final class Leases
{
    public function __construct(private readonly Lifecycle $lifecycle, private readonly Events $events) {}

    /** Claim the oldest eligible task in one explicit runtime worker slot. */
    public function claim(RuntimeBinding $binding, ?int $workerSlot = null): ?Run
    {
        return DB::transaction(function () use ($binding, $workerSlot) {
            Jobs\AccountLock::lock($binding->user_id);
            if (!Jobs\Slots::available($binding, $workerSlot)) return null;
            return $this->claimWithin($binding, $workerSlot);
        });
    }

    private function claimWithin(RuntimeBinding $binding, ?int $workerSlot): ?Run
    {
        app(Cloud\Authority::class)->check($binding);
        $candidates = Run::query()->where('runtime_binding_id', $binding->id)->where('user_id', $binding->user_id)
            ->whereIn('state', RunStates::CLAIMABLE)->whereNull('cancel_requested_at')
            ->where(fn ($q) => $q->whereNull('lease_expires_at')->orWhere('lease_expires_at', '<', now()))
            // Parked by sign-in/limits: only after the account changes or the reset time passes.
            ->where(fn ($q) => $q->whereNotIn('state', [RunStates::WAITING_SIGNIN, RunStates::PAUSED_LIMITS])
                ->orWhereNull('wait_revision')->orWhere('wait_revision', '!=', $binding->revision)
                ->orWhere('resume_after', '<=', now()))
            ->orderBy('created_at')->orderBy('conversation_seq')->limit(Jobs\AccountLock::enabled($binding->user_id) ? Jobs\Capacity::QUEUED + Jobs\Capacity::RUNNING : 20)->get();
        foreach ($candidates as $candidate) {
            $snap = $candidate->runtime_snapshot;
            // Pinned account: a run admitted on another AI account waits for that account.
            if (($snap['provider'] ?? null) !== $binding->provider || ($snap['accountRef'] ?? null) !== $binding->account_ref) continue;
            if (Cloud\Authority::cloud($binding) && (($snap['model'] ?? null) !== $binding->model || ($snap['effort'] ?? null) !== $binding->effort)) continue;
            if (!\App\Services\AgentWork\RuntimePins::allowsRun($binding, $candidate) || !\App\Services\AgentWork\SkillSnapshots::supports($binding, $candidate)) continue;
            if (Jobs\Contexts::mode($candidate) === 'ordered' && $this->conversationBusy($candidate)) continue;
            if (!Jobs\Slots::eligible($binding, $candidate, $workerSlot)) continue;
            $claimed = DB::transaction(function () use ($candidate, $binding, $workerSlot) {
                try { \App\Services\AgentCoordination\Context::fence($binding, $candidate->id); }
                catch (\Illuminate\Http\Exceptions\HttpResponseException|\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                    return null; // A stale group cannot prevent unrelated eligible work from being claimed.
                }
                app(Cloud\Authority::class)->check($binding);
                if (Jobs\AccountLock::enabled($binding->user_id)) Jobs\Slots::binding($binding);
                \App\Services\AgentWork\RuntimePins::fenceBinding($binding, $candidate->id);
                \App\Services\AgentWork\SkillSnapshots::fenceBinding($binding, $candidate->id);
                $run = Run::query()->whereKey($candidate->id)->lockForUpdate()->first();
                if (!$run || !in_array($run->state, RunStates::CLAIMABLE, true) || $run->cancel_requested_at
                    || ($run->lease_expires_at && $run->lease_expires_at->isFuture())) return null;
                if (!\App\Services\AgentWork\RuntimePins::allowsRun($binding, $run)) return null;
                if (Steering::pending($run) && ($binding->capabilities['taskSteering'] ?? false) !== true) return null;
                if (Steering::unsettled($run)) return null;
                // A lease that lapsed (the Mac crashed or slept) is a lost attempt; a wait releases its lease, so it is not.
                $lapsed = $run->lease_expires_at !== null;
                if ($lapsed && $run->lapsed_claims >= max(1, (int) config('agents_v2.max_claims')) - 1) {
                    $this->giveUp($run);
                    return null;
                }
                app(Steering::class)->apply($run);
                $run->forceFill(['lapsed_claims' => $run->lapsed_claims + ($lapsed ? 1 : 0), 'lease_generation' => $run->lease_generation + 1,
                    'lease_expires_at' => now()->addSeconds((int) config('agents_v2.lease_seconds')),
                    'started_at' => $run->started_at ?? now(), 'wait_revision' => null, 'resume_after' => null])->save();
                Jobs\Slots::assign($binding, $run, $workerSlot);
                $this->events->append($run, 'run.claimed', ['generation' => $run->lease_generation,
                    'hostId' => $binding->host_id]);
                if ($run->state !== RunStates::STARTING) $this->lifecycle->move($run, RunStates::STARTING);
                return $run;
            });
            if ($claimed) return $claimed;
        }
        return null;
    }

    /** F-05: after `max_claims` attempts the run ends `runner_error` instead of re-running the model on the Mac forever. */
    private function giveUp(Run $run): void
    {
        $uncertain = ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['dispatching', 'unknown'])->exists();
        $this->lifecycle->move($run, $uncertain ? RunStates::UNKNOWN : RunStates::FAILED,
            'The Mac stopped answering this task '.max(1, (int) config('agents_v2.max_claims')).' times in a row, so Vibyra ended it.', ['code' => 'runner_error']);
    }

    /** Serialize turns in one conversation: an older live run goes first. */
    private function conversationBusy(Run $run): bool
    {
        return Run::query()->where('agent_id', $run->agent_id)->where('user_id', $run->user_id)
            ->whereNotIn('state', RunStates::TERMINAL)->where('id', '!=', $run->id)
            ->whereNotIn('id', \App\Models\AgentV2\Job::query()->where('mode', '!=', 'ordered')->select('run_id'))
            ->where('conversation_seq', '<', $run->conversation_seq)->exists();
    }

    /** Lock and fence one run for a runner write. */
    public function fenced(RuntimeBinding $binding, string $runId, int $generation, bool $allowCancelled = false, bool $factualReceipt = false): Run
    {
        Jobs\AccountLock::lock($binding->user_id);
        \App\Services\AgentCoordination\Context::fence($binding, $runId, $allowCancelled);
        app(Cloud\Authority::class)->check($binding);
        Jobs\Slots::fence($binding, $runId, $allowCancelled, $factualReceipt);
        \App\Services\AgentWork\RuntimePins::fenceBinding($binding, $runId);
        \App\Services\AgentWork\SkillSnapshots::fenceBinding($binding, $runId);
        $run = Run::query()->whereKey($runId)->where('user_id', $binding->user_id)
            ->where('runtime_binding_id', $binding->id)->lockForUpdate()->first();
        if (!$run) ApiError::throw(404, 'run_not_found', 'That task does not exist.');
        if (!\App\Services\AgentWork\RuntimePins::allowsRun($binding, $run))
            ApiError::throw(409, 'work_runtime_changed', 'The reviewed runtime changed or this work expired.');
        $snap = $run->runtime_snapshot;
        if (($snap['provider'] ?? null) !== $binding->provider || ($snap['accountRef'] ?? null) !== $binding->account_ref
            || (Cloud\Authority::cloud($binding) && (($snap['model'] ?? null) !== $binding->model || ($snap['effort'] ?? null) !== $binding->effort)))
            ApiError::throw(409, 'runtime_account_changed', 'This task belongs to a different AI account selection.');
        if ($run->lease_generation !== $generation || $generation < 1)
            ApiError::throw(409, 'stale_lease', 'This runner no longer holds the task lease.');
        if (!$allowCancelled && ($run->cancel_requested_at || $run->state === RunStates::CANCELLED))
            ApiError::throw(409, 'run_cancelled', 'This task was cancelled.');
        if (!$allowCancelled && RunStates::terminal($run->state))
            ApiError::throw(409, 'run_finished', 'This task already finished.');
        if (!$allowCancelled && Steering::pending($run))
            ApiError::throw(409, 'instruction_pending', 'Updated task instructions are waiting for a safe checkpoint.');
        return $run;
    }

    public function heartbeat(RuntimeBinding $binding, string $runId, int $generation): array
    {
        return DB::transaction(function () use ($binding, $runId, $generation) {
            $run = $this->fenced($binding, $runId, $generation, true);
            // A late heartbeat must not resurrect an attempt already released at a steering checkpoint.
            if (!RunStates::terminal($run->state) && !(Steering::pending($run) && $run->lease_expires_at === null)) $run->forceFill([
                'lease_expires_at' => now()->addSeconds((int) config('agents_v2.lease_seconds'))])->save();
            return ['state' => $run->state, 'cancelRequested' => $run->cancel_requested_at !== null,
                'steeringRequested' => Steering::pending($run), 'instructionRevision' => $run->instruction_revision,
                'generation' => $run->lease_generation, 'leaseExpiresAt' => $run->lease_expires_at?->toIso8601String()];
        });
    }
}
