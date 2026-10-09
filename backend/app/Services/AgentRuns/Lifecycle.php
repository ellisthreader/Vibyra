<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;

/** State transitions, each journalled; the four notification hooks are emitted here. */
final class Lifecycle
{
    private const HOOKS = [RunStates::COMPLETED => 'run.completed', RunStates::WAITING_APPROVAL => 'run.waiting_approval',
        RunStates::WAITING_SIGNIN => 'run.waiting_signin', RunStates::FAILED => 'run.failed',
        RunStates::CANCELLED => 'run.cancelled', RunStates::UNKNOWN => 'run.outcome_unknown'];

    public function __construct(private readonly Events $events) {}

    public function move(Run $run, string $to, ?string $reason = null, array $hookPayload = []): void
    {
        if ($run->state === $to) return;
        if (!RunStates::allowed($run->state, $to))
            ApiError::throw(409, 'invalid_transition', 'This task cannot move from '.$run->state.' to '.$to.'.');
        $from = $run->state;
        $terminal = RunStates::terminal($to);
        $run->forceFill(['state' => $to, 'state_reason' => $reason,
            'finished_at' => $terminal ? now() : $run->finished_at,
            'lease_expires_at' => $terminal ? null : $run->lease_expires_at])->save();
        $this->events->append($run, 'run.state', ['from' => $from, 'to' => $to, 'reason' => $reason]);
        if (isset(self::HOOKS[$to])) $this->events->append($run, self::HOOKS[$to], [...$hookPayload, 'reason' => $reason]);
        app(\App\Services\Platform\WebhookEvents::class)->runMoved($run, $from, $to);
        if ($terminal) \App\Services\AgentCoordination\Context::afterRun($run);
    }
}
