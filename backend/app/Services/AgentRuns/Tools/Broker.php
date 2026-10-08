<?php

namespace App\Services\AgentRuns\Tools;

use App\Services\AgentRuns\Guard\SecretGuard;

use App\Models\AgentV2\Run;
use App\Models\AgentV2\RuntimeBinding;
use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\ApiError;
use App\Services\AgentRuns\Canonical;
use App\Services\AgentRuns\Events;
use App\Services\AgentRuns\Leases;
use App\Services\AgentRuns\Lifecycle;
use App\Services\AgentRuns\RunnerFlow;
use App\Services\AgentRuns\RunStates;
use App\Services\AgentRuns\Computer\{ComputerBinding, ComputerTools};
use App\Services\AgentRuns\LocalMcp\LocalMcpTools;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * The only way a runner's model reaches an integration. It validates the lease,
 * grant, connection and schema; reads execute server-side and return their
 * result; writes become pending exact approvals. Retrying a call ID is idempotent.
 */
final class Broker
{
    public function __construct(private readonly Leases $leases, private readonly Manifest $manifest,
        private readonly ToolCatalog $catalog, private readonly Executor $executor, private readonly Events $events,
        private readonly Lifecycle $lifecycle, private readonly RunnerFlow $flow) {}

    public function request(RuntimeBinding $binding, string $runId, array $call): array
    {
        $prepared = DB::transaction(function () use ($binding, $runId, $call) {
            $run = $this->leases->fenced($binding, $runId, (int) $call['generation']);
            $existing = ToolAction::query()->where('run_id', $run->id)->where('call_id', $call['callId'])->first();
            if ($existing) {
                if ($existing->tool !== $call['tool'] || ($existing->draft_original_connection_id ?? $existing->connection_id) !== $call['connectionId']
                    || $existing->args_hash !== Canonical::hash($call['arguments']))
                    ApiError::throw(409, 'call_conflict', 'This call ID was already used with different arguments.');
                return ['replay' => $existing];
            }
            if (!in_array($run->state, RunStates::ACTIVE, true))
                ApiError::throw(409, 'run_not_active', 'This task is '.$run->state.'; it cannot call tools now.');
            $this->flow->resume($run);
            if ($call['tool'] === \App\Services\AgentWork\Proposals\ProposalTool::NAME)
                return ['replay' => app(\App\Services\AgentWork\Proposals\ProposalBroker::class)->request($run, $call)];
            if (\App\Services\AgentRuns\CloudFiles\FileTools::has($call['tool']))
                return ['replay' => app(\App\Services\AgentRuns\CloudFiles\FileBroker::class)->request($run, $call)];
            if (\App\Services\AgentRuns\Outputs\OutputTools::has($call['tool']))
                return ['replay' => app(\App\Services\AgentRuns\Outputs\OutputBroker::class)->request($run, $call)];
            try {
                if ($run->tool_calls >= (int) config('agents_v2.max_tool_calls'))
                    throw new ToolRefused('limit_reached', 'This task reached its tool-call limit.');
                [$grant, $connection] = $this->manifest->authorize($run, $call['tool'], $call['connectionId']);
                if ($call['schemaRevision'] !== $this->catalog->schemaRevision($call['tool']))
                    throw new ToolRefused('schema_changed', 'That tool changed. Refresh the tool manifest.');
                // Browser actions also run on the leased Mac (Phase 7): same claim flow, own binding.
                $browser = $connection->provider === \App\Services\AgentRuns\Browser\BrowserTools::PROVIDER;
                $local = LocalMcpTools::isProvider($connection->provider);
                $computer = $browser || $local || $connection->provider === ComputerTools::PROVIDER;
                // Computer calls bind the Mac snapshot / GitHub account into their exact arguments.
                try { $args = $browser ? app(\App\Services\AgentRuns\Browser\BrowserBinding::class)->bind($run, $connection, $call['tool'], $call['arguments'])
                    : ($computer && !$local ? app(ComputerBinding::class)->bind($run, $connection, $call['tool'], $call['arguments'])
                    : $this->catalog->validate($call['tool'], $call['arguments'])); }
                catch (HttpException $e) { throw new ToolRefused('invalid_arguments', $e->getMessage()); }
                if ($this->catalog->kind($call['tool']) === 'write' && ToolAction::query()->where('run_id', $run->id)
                    ->where('tool', $call['tool'])->where('state', 'unknown')->get()
                    ->contains(fn (ToolAction $u) => Canonical::hash($u->arguments) === Canonical::hash($args)))
                    throw new ToolRefused('outcome_unknown', 'The same change already has an unknown outcome. Ask the person to check the provider; it is never repeated automatically.');
            } catch (ToolRefused $refused) {
                return ['replay' => $this->refuse($run, $call, $refused)];
            }
            $write = $this->catalog->kind($call['tool']) === 'write';
            if ($write && $run->instruction_revision > 0 && ToolAction::query()->where('run_id', $run->id)
                ->where('tool', $call['tool'])->where('connection_id', $connection->id)->whereNotNull('dispatched_at')
                ->where('instruction_revision', '<', $run->instruction_revision)->get()
                ->contains(fn ($prior) => Canonical::hash($prior->arguments) === Canonical::hash($args)))
                return ['replay' => $this->refuse($run, $call, new ToolRefused('already_dispatched',
                    'This exact change was already dispatched before the updated instruction. Check its saved receipt; it is not repeated.'))];
            $action = ToolAction::query()->create(['run_id' => $run->id, 'user_id' => $run->user_id,
                'instruction_revision' => $run->instruction_revision, 'call_id' => $call['callId'], 'tool' => $call['tool'], 'kind' => $write ? 'write' : 'read',
                'connection_id' => $connection->id, 'connection_generation' => $connection->generation,
                'grant_id' => $grant->id, 'grant_revision' => $grant->revision, 'arguments' => $args,
                'args_hash' => Canonical::hash($call['arguments']), 'schema_revision' => $call['schemaRevision'],
                'state' => $write ? 'pending_approval' : ($computer ? 'approved' : 'dispatching'),
                'dispatched_at' => $write || $computer ? null : now(),
                'expires_at' => $write || $computer ? now()->addSeconds((int) config('agents_v2.approval_seconds')) : null]);
            $run->forceFill(['tool_calls' => $run->tool_calls + 1])->save();
            $this->events->append($run, 'tool.requested', ['actionId' => $action->id, 'callId' => $action->call_id,
                'tool' => $action->tool, 'kind' => $action->kind, 'connectionId' => $connection->id]);
            if ($write) {
                $action->forceFill(['fingerprint' => Approvals::fingerprint($action, $run->user_id),
                    'secret_kinds' => SecretGuard::enabled() ? (SecretGuard::kindsIn($args) ?: null) : null])->save();
                $this->events->append($run, 'approval.requested', ['actionId' => $action->id, 'tool' => $action->tool,
                    'connectionId' => $connection->id, 'account' => $connection->external_identity,
                    'arguments' => SecretGuard::enabled() ? SecretGuard::redactValue($args) : $args, 'fingerprint' => $action->fingerprint,
                    'expiresAt' => $action->expires_at->toIso8601String()]);
                $this->lifecycle->move($run, RunStates::WAITING_APPROVAL, null, ['actionId' => $action->id, 'tool' => $action->tool]);
                return ['replay' => $action];
            }
            $this->lifecycle->move($run, RunStates::WAITING_TOOL);
            if ($computer) { // A Mac read: the leased runner claims and answers it (ComputerActions).
                $action->forceFill(['fingerprint' => Approvals::fingerprint($action, $run->user_id)])->save();
                return ['replay' => $action];
            }
            return ['execute' => [$action, $connection]];
        });
        if (isset($prepared['replay'])) return $this->outcome($prepared['replay']);
        [$action, $connection] = $prepared['execute'];
        $done = $this->executor->execute($action, $connection);
        DB::transaction(function () use ($action) {
            $run = Run::query()->whereKey($action->run_id)->lockForUpdate()->firstOrFail();
            if ($run->state === RunStates::WAITING_TOOL) $this->lifecycle->move($run, RunStates::RUNNING);
        });
        return $this->outcome($done);
    }

    private function refuse(Run $run, array $call, ToolRefused $refused): ToolAction
    {
        $attributes = ['run_id' => $run->id, 'user_id' => $run->user_id,
            'call_id' => $call['callId'], 'tool' => mb_substr($call['tool'], 0, 80), 'kind' => 'none',
            'connection_id' => $call['connectionId'], 'connection_generation' => 0, 'grant_id' => '00000000-0000-0000-0000-000000000000',
            'grant_revision' => 0, 'arguments' => [], 'args_hash' => Canonical::hash($call['arguments']),
            'schema_revision' => mb_substr((string) $call['schemaRevision'], 0, 20), 'state' => 'refused',
            'result' => ['error' => $refused->getMessage(), 'reason' => $refused->reason],
            'summary' => mb_substr($refused->getMessage(), 0, 255)];
        // F-13: refusals do not count as tool calls, so they have their own cap. Past it the runner still gets the same
        // answer, but nothing more is stored or journalled (one journal.truncated marker says so).
        if (ToolAction::query()->where('run_id', $run->id)->where('state', 'refused')->count() >= (int) config('agents_v2.max_refused_calls', 50)) {
            $this->events->truncated($run, 'refused_calls');
            return (new ToolAction($attributes))->forceFill(['id' => (string) \Illuminate\Support\Str::uuid()]);
        }
        $action = ToolAction::query()->create($attributes);
        $this->events->append($run, 'tool.refused', ['actionId' => $action->id, 'callId' => $action->call_id,
            'tool' => $action->tool, 'reason' => $refused->reason, 'message' => $refused->getMessage()]);
        return $action;
    }

    /** What the runner (and so the model) receives. Pending writes carry no result yet and no fingerprint. */
    public function outcome(ToolAction $a): array
    {
        $result = \App\Services\AgentRuns\CloudFiles\FileTools::has($a->tool)
            ? \App\Services\AgentRuns\CloudFiles\FileBroker::result($a) : ($a->result ?? []);
        $body = ['id' => $a->id, 'callId' => $a->call_id, 'tool' => $a->tool, 'kind' => $a->kind,
            'connectionId' => $a->connection_id, 'state' => $a->state, 'summary' => $a->summary];
        // F-03: no fingerprint here. The runner must not learn what only the person's approval may quote; the
        // person reads it from the run (`actions[].fingerprint`, `approval.requested`), and a Mac action is claimed after approval.
        if ($a->state === 'pending_approval') return [...$body, 'expiresAt' => $a->expires_at?->toIso8601String()];
        if (in_array($a->state, ['completed', 'failed', 'unknown', 'refused', 'declined', 'expired', 'cancelled'], true))
            return [...$body, 'result' => (object) (SecretGuard::enabled() ? SecretGuard::redactValue($result) : $result), 'receipt' => $this->receipt($a)]; // a refusal has one only when the sweeper closed it
        return $body;
    }

    private function receipt(ToolAction $a): ?array
    {
        $r = \App\Models\AgentV2\Receipt::query()->where('action_id', $a->id)->first();
        return $r ? ['status' => $r->status, 'outcome' => $r->outcome, 'providerResourceId' => $r->provider_resource_id,
            'url' => $r->provider_url] : null;
    }
}
