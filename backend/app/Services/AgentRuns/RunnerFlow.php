<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;
use App\Models\AgentV2\RuntimeBinding;
use App\Models\AgentV2\ToolAction;
use Illuminate\Support\Facades\DB;

/** Model output, completion and failure posted by the leased Mac runner. */
final class RunnerFlow
{
    public const RUNNER_EVENTS = ['message.delta', 'message.final', 'status'];

    public function __construct(private readonly Leases $leases, private readonly Lifecycle $lifecycle,
        private readonly Events $events) {}

    public function events(RuntimeBinding $binding, string $runId, int $generation, array $events): int
    {
        return DB::transaction(function () use ($binding, $runId, $generation, $events) {
            $run = $this->leases->fenced($binding, $runId, $generation);
            $this->resume($run);
            // F-13: streamed text and status lines stop at the journal cap; the final answer and every lifecycle event still land.
            $cap = (int) config('agents_v2.max_journal_events', 2000);
            $dropped = false;
            foreach ($events as $event) {
                if ($run->event_seq >= $cap && in_array($event['type'], ['message.delta', 'status'], true)) { $dropped = true; continue; }
                $this->events->append($run, $event['type'], ['text' => $event['text']], 'runner');
            }
            if ($dropped) $this->events->truncated($run, 'runner_events');
            return $run->event_seq;
        });
    }

    public function complete(RuntimeBinding $binding, string $runId, int $generation, string $answer): Run
    {
        return DB::transaction(function () use ($binding, $runId, $generation, $answer) {
            $run = $this->leases->fenced($binding, $runId, $generation);
            if (ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['pending_approval', 'approved', 'dispatching'])->exists())
                ApiError::throw(409, 'actions_open', 'Finish or cancel the open tool actions before completing.');
            $this->resume($run);
            $answer = $this->clip($answer);
            $run->forceFill(['answer' => $answer])->save();
            $this->events->append($run, 'message.final', ['text' => $answer], 'runner');
            // A write the provider never confirmed keeps the task honest: it ends outcome_unknown, not completed.
            if (ToolAction::query()->where('run_id', $run->id)->where('state', 'unknown')->exists())
                $this->lifecycle->move($run, RunStates::UNKNOWN, 'write_outcome_unknown', ['code' => 'write_outcome_unknown']);
            else $this->lifecycle->move($run, RunStates::COMPLETED, null, ['answerChars' => mb_strlen($answer)]);
            return $run;
        });
    }

    /** F-05: a longer answer is kept up to the limit with a notice, never refused (a refusal made the Mac re-run the task). */
    private function clip(string $answer): string
    {
        $limit = (int) config('agents_v2.max_answer_chars');
        if (mb_strlen($answer) <= $limit) return $answer;
        $notice = "\n\n[Vibyra shortened this answer: it was ".number_format(mb_strlen($answer)).' characters and the limit is '.number_format($limit).'.]';
        return mb_substr($answer, 0, $limit - mb_strlen($notice)).$notice;
    }

    /**
     * `provider_signin` and `limits` are waits, not failures; anything else fails the run.
     * A wait parks the run for this binding revision: it is re-offered only after the Mac
     * re-registers (account/selection change) or, for limits, after `resumeAt` (default 30 min).
     */
    public function fail(RuntimeBinding $binding, string $runId, int $generation, string $code, string $reason,
        ?\DateTimeInterface $resumeAt = null): Run
    {
        return DB::transaction(function () use ($binding, $runId, $generation, $code, $reason, $resumeAt) {
            $run = $this->leases->fenced($binding, $runId, $generation);
            $uncertain = ToolAction::query()->where('run_id', $run->id)->whereIn('state', ['dispatching', 'unknown'])->exists();
            $to = match (true) {
                $code === 'provider_signin' => RunStates::WAITING_SIGNIN,
                $code === 'limits' => RunStates::PAUSED_LIMITS,
                $uncertain => RunStates::UNKNOWN,
                default => RunStates::FAILED,
            };
            if (in_array($to, [RunStates::WAITING_SIGNIN, RunStates::PAUSED_LIMITS], true)) {
                $this->resume($run);
                $resume = $to === RunStates::PAUSED_LIMITS ? now()->addMinutes(30) : null;
                if ($resume && $resumeAt) $resume = \Illuminate\Support\Carbon::instance($resumeAt)->max(now()->addMinute())->min(now()->addDays(7));
                $run->forceFill(['wait_revision' => $binding->revision, 'resume_after' => $resume, 'lease_expires_at' => null])->save();
            }
            $this->lifecycle->move($run, $to, $reason, ['code' => $code,
                'scope' => $code === 'provider_signin' ? 'ai_account' : null]);
            return $run;
        });
    }

    /** Any runner output moves a starting or waiting run back to running. */
    public function resume(Run $run): void
    {
        if (in_array($run->state, [RunStates::STARTING, RunStates::WAITING_SIGNIN, RunStates::PAUSED_LIMITS, RunStates::WAITING_TOOL], true))
            $this->lifecycle->move($run, RunStates::RUNNING);
    }
}
