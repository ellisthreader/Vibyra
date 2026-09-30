<?php

namespace App\Services\AgentRuns\Tools;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Receipt;
use App\Models\AgentV2\Run;
use App\Models\AgentV2\ToolAction;
use App\Services\AgentRuns\Connections\Connections;
use App\Services\AgentRuns\Connections\Credentials;
use App\Services\AgentRuns\Events;
use App\Services\AgentRuns\Lifecycle;
use App\Services\AgentRuns\RunStates;
use App\Services\AgentRuns\SafeUrl;
use App\Services\AgentRuns\Tools\Providers\{Adapters, ToolFailure};
use App\Services\ChatConnectors\ReconnectRequired;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Runs one dispatched action against its own connection and records a typed
 * receipt: confirmed, refused, retryable, rate_limited, reconnect_required or
 * outcome_unknown. An unknown write gets one read-only reconciliation and is
 * never re-sent. Credentials are resolved here and never leave this call.
 */
final class Executor
{
    public function __construct(private readonly Adapters $adapters, private readonly Credentials $credentials,
        private readonly Connections $connections, private readonly Events $events, private readonly Lifecycle $lifecycle) {}

    public function execute(ToolAction $action, Connection $connection): ToolAction
    {
        $provider = $connection->provider;
        $adapter = $this->adapters->for($provider);
        $name = $this->adapters->name($provider);
        try { $credential = $this->credentials->for($connection); }
        catch (ReconnectRequired $e) { return $this->reconnect($action, $connection, $e); }
        catch (\Throwable $e) {
            return $this->fail($action, ToolFailure::refused('credential_unavailable', 'Connect '.$name.' before using it.'));
        }
        try {
            return $this->confirm($action, $adapter->run($action->tool, $action->arguments, $credential, $action->id));
        } catch (ReconnectRequired $e) {
            return $this->reconnect($action, $connection, $e);
        } catch (ToolFailure $f) {
            $failure = $f;
        } catch (HttpException $e) {
            $failure = ToolFailure::refused('invalid_request', $e->getMessage());
        } catch (\Throwable $e) {
            report($e);
            $failure = $action->kind === 'write' ? ToolFailure::unknown($name) : ToolFailure::retryable($name.' could not complete this request.');
        }
        if ($failure->outcome === ToolFailure::UNKNOWN && $action->kind !== 'write')
            $failure = ToolFailure::retryable($name.' could not complete this request.');
        if ($failure->outcome === ToolFailure::UNKNOWN) {
            try {
                $found = $adapter->reconcile($action->tool, $action->arguments, $credential, $action->id);
                if ($found) return $this->confirm($action, [...$found, 'reconciled' => true]);
            } catch (\Throwable) {} // Still unknown: reconciliation proved nothing either way.
        }
        if ($failure->reason === 'insufficient_scope') $this->connections->markScope($connection, $action->tool);
        return $this->fail($action, $failure);
    }

    /** The sweeper's one read-only look for the exact approved change (never a re-send); null when absent or not checkable. */
    public function lookup(ToolAction $action, Connection $connection): ?array
    {
        try {
            return $this->adapters->for($connection->provider)->reconcile($action->tool, $action->arguments ?? [],
                $this->credentials->for($connection), $action->id);
        } catch (\Throwable) { return null; } // A revoked connection or an unreachable provider proves nothing either way.
    }

    /** Close an action whose process died mid-call: confirmed when the lookup found it, else unknown for a write and retryable for a read. */
    public function settleLost(ToolAction $action, Connection $connection, ?array $found): ToolAction
    {
        if ($found) return $this->confirm($action, [...$found, 'reconciled' => true]);
        $name = $this->adapters->name($connection->provider);
        return $this->fail($action, $action->kind === 'write' ? ToolFailure::unknown($name)
            : ToolFailure::retryable($name.' did not answer before Vibyra restarted. Try the call again.'));
    }

    private function confirm(ToolAction $action, array $outcome): ToolAction
    {
        $result = $this->bounded((array) ($outcome['result'] ?? []));
        if (!empty($outcome['reconciled'])) $result['reconciled'] = true;
        return $this->finish($action, 'completed', 'confirmed', 'confirmed', $result,
            (string) ($outcome['summary'] ?? $action->tool), $outcome);
    }

    private function fail(ToolAction $action, ToolFailure $f): ToolAction
    {
        $unknown = $f->outcome === ToolFailure::UNKNOWN;
        $result = array_filter(['error' => $f->getMessage(), 'outcome' => $f->outcome, 'reason' => $f->reason,
            'retryAfter' => $f->retryAfter, 'retryable' => in_array($f->outcome, [ToolFailure::RETRYABLE, ToolFailure::RATE_LIMITED], true)],
            fn ($v) => $v !== null);
        $summary = match ($f->outcome) {
            ToolFailure::UNKNOWN => 'Outcome not confirmed',
            ToolFailure::RATE_LIMITED => 'Rate limited by the provider',
            ToolFailure::RETRYABLE => 'Provider temporarily unavailable',
            default => mb_substr($f->getMessage(), 0, 255),
        };
        return $this->finish($action, $unknown ? 'unknown' : 'failed', $unknown ? 'unknown' : 'failed', $f->outcome, $result, $summary);
    }

    private function reconnect(ToolAction $action, Connection $connection, ReconnectRequired $e): ToolAction
    {
        $provider = $connection->provider;
        $this->connections->markReconnect($connection);
        $done = $this->finish($action, 'failed', 'failed', 'reconnect_required', ['error' => $e->getMessage(),
            'outcome' => 'reconnect_required', 'reason' => 'reconnect_required', 'retryable' => false],
            ucfirst($provider).' needs to be reconnected');
        $run = Run::query()->whereKey($action->run_id)->first();
        if ($run && !RunStates::terminal($run->state)) {
            if ($run->state === RunStates::WAITING_TOOL || $run->state === RunStates::WAITING_APPROVAL) $this->lifecycle->move($run, RunStates::RUNNING);
            $this->lifecycle->move($run, RunStates::WAITING_SIGNIN, 'reconnect_required',
                ['scope' => 'connection', 'provider' => $provider, 'connectionId' => $connection->id]);
        }
        return $done;
    }

    public function finish(ToolAction $action, string $state, string $status, string $outcome, array $result,
        string $summary, array $confirmed = []): ToolAction
    {
        $resourceId = is_string($confirmed['resourceId'] ?? null) ? mb_substr($confirmed['resourceId'], 0, 255) : null;
        // F-09: no fragment, userinfo or token parameter reaches the receipt, the journal or the model, whichever provider sent it.
        $url = is_string($confirmed['url'] ?? null) ? self::capped(SafeUrl::clean($confirmed['url']), 500) : null;
        $result = SafeUrl::scrub($result);
        $action->forceFill(['state' => $state, 'result' => $result, 'summary' => mb_substr($summary, 0, 255)])->save();
        Receipt::query()->updateOrCreate(['action_id' => $action->id], ['run_id' => $action->run_id,
            'provider_resource_id' => $resourceId, 'status' => $status, 'outcome' => $outcome, 'provider_url' => $url,
            'idempotency_key' => is_string($confirmed['idempotencyKey'] ?? null) ? mb_substr($confirmed['idempotencyKey'], 0, 120) : null,
            'summary' => mb_substr($summary, 0, 255)]);
        $run = Run::query()->whereKey($action->run_id)->firstOrFail();
        $this->events->append($run, 'tool.result', ['actionId' => $action->id, 'callId' => $action->call_id,
            'tool' => $action->tool, 'status' => $status, 'outcome' => $outcome, 'summary' => $summary,
            'providerResourceId' => $resourceId, 'url' => $url]);
        return $action;
    }

    private static function capped(?string $value, int $max): ?string
    {
        return $value === null ? null : mb_substr($value, 0, $max);
    }

    /** Bounded output: long strings are cut and the result says it was truncated. */
    private function bounded(array $result): array
    {
        $limit = (int) config('agents_v2.max_result_bytes', 32000);
        if (strlen(json_encode($result)) <= $limit) return $result;
        array_walk_recursive($result, function (&$value) {
            if (is_string($value) && mb_strlen($value) > 2000) $value = mb_substr($value, 0, 2000);
        });
        $result['truncated'] = true;
        return strlen(json_encode($result)) <= $limit ? $result : ['truncated' => true, 'error' => 'The result was too large to return.'];
    }
}
