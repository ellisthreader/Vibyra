<?php

namespace App\Services\AgentRuns\Planning;

use App\Models\AgentV2\{Connection, Run};
use App\Services\AgentRuns\Connections\{Connections, Readiness};
use App\Services\AgentRuns\Tools\Providers\Adapters;
use Illuminate\Support\Facades\DB;

/**
 * Why a service the task names (or a granted account) will not be usable, and
 * the one step that fixes it. Reasons: `not_connected`, `unavailable` (this
 * environment cannot connect it), `not_granted`, `reconnect_required`,
 * `over_cap` (granted, but the per-task tool cap kept other tools; not blocking),
 * `computer_unavailable`, `no_tools`. Suggestions only: nothing is granted here.
 */
final class PlanGaps
{
    public function __construct(private readonly Connections $connections, private readonly Readiness $readiness,
        private readonly Adapters $adapters) {}

    public function find(int $userId, object $agent, Run $run, array $mentioned, array $services, array $dropped): array
    {
        $active = collect($this->connections->active($userId));
        $granted = DB::table('agent_grants')->where('user_id', $userId)->where('agent_id', $agent->id)
            ->whereNull('revoked_at')->pluck('connection_id')->all();
        $usedProviders = array_unique(array_column($services, 'provider'));
        $droppedConnections = array_unique(array_column($dropped, 'connectionId'));
        $gaps = [];
        foreach ($mentioned as $provider) {
            if (in_array($provider, $usedProviders, true)) continue;
            $mine = $active->filter(fn (Connection $c) => $c->provider === $provider)->values();
            $gaps[] = $this->gap($provider, $agent, $mine, $granted, $droppedConnections);
        }
        foreach ($active as $c) {
            if (!in_array($c->id, $granted, true) || $c->health === 'healthy' || in_array($c->provider, $mentioned, true)) continue;
            $gaps[] = [...$this->reconnect($c), 'blocking' => false];
        }
        return $gaps;
    }

    private function gap(string $provider, object $agent, $mine, array $granted, array $dropped): array
    {
        $name = $this->adapters->name($provider);
        $base = ['provider' => $provider, 'name' => $name, 'connectionId' => null, 'account' => null, 'blocking' => true];
        if ($provider === 'computer') {
            $grantedHere = $mine->first(fn ($c) => in_array($c->id, $granted, true));
            return [...$base, 'connectionId' => $grantedHere?->id, 'reason' => $grantedHere ? 'computer_unavailable' : 'not_granted',
                'message' => $grantedHere ? 'This teammate\'s project folder is on a Mac that is not running this task.'
                    : 'This teammate has no project folder on your Mac.',
                'fix' => ['action' => 'grant_folder', 'method' => null, 'path' => null,
                    'message' => 'On your Mac, open this teammate and choose a project folder it may use.']];
        }
        if ($mine->isEmpty()) {
            $state = $this->readiness->state($provider);
            if ($state['readiness'] !== 'ready') return [...$base, 'reason' => 'unavailable',
                'message' => $state['message'] ?? $name.' is not available yet.', 'fix' => null];
            return [...$base, 'reason' => 'not_connected', 'message' => 'No '.$name.' account is connected.',
                'fix' => ['action' => 'connect', 'method' => 'POST', 'path' => '/api/agents/v2/connections/'.$provider.'/start',
                    'message' => 'Connect '.$name.' in Connections.']];
        }
        $held = $mine->filter(fn ($c) => in_array($c->id, $granted, true))->values();
        if ($held->isEmpty()) {
            $first = $mine->first();
            return [...$base, 'connectionId' => $first->id, 'account' => $first->external_identity, 'reason' => 'not_granted',
                'accounts' => $mine->map(fn ($c) => ['connectionId' => $c->id, 'account' => $c->external_identity])->all(),
                'message' => $agent->name.' has no access to '.$name.'.',
                'fix' => ['action' => 'grant', 'method' => 'PUT', 'path' => '/api/agents/v2/agents/'.$agent->id.'/grants/'.$first->id,
                    'message' => 'Choose what '.$agent->name.' may do with '.($first->external_identity ?: $name).'.']];
        }
        if ($over = $held->first(fn ($c) => in_array($c->id, $dropped, true)))
            return [...$base, 'connectionId' => $over->id, 'account' => $over->external_identity, 'reason' => 'over_cap',
                'blocking' => false, 'message' => 'Only '.(int) config('agents_v2.max_tools', 10).' tools fit one task.',
                'fix' => ['action' => 'mention', 'method' => null, 'path' => null,
                    'message' => 'Name '.$name.' in the task, or remove access this teammate does not need.']];
        if ($bad = $held->first(fn ($c) => $c->health !== 'healthy')) return [...$this->reconnect($bad), 'blocking' => true];
        return [...$base, 'connectionId' => $held->first()->id, 'account' => $held->first()->external_identity, 'reason' => 'no_tools',
            'message' => $agent->name.' has no usable '.$name.' tools.',
            'fix' => ['action' => 'grant', 'method' => 'PUT', 'path' => '/api/agents/v2/agents/'.$agent->id.'/grants/'.$held->first()->id,
                'message' => 'Choose what '.$agent->name.' may do with '.$name.'.']];
    }

    private function reconnect(Connection $c): array
    {
        $name = $this->adapters->name($c->provider);
        return ['provider' => $c->provider, 'name' => $name, 'connectionId' => $c->id, 'account' => $c->external_identity,
            'reason' => 'reconnect_required', 'message' => $name.' ('.$c->external_identity.') needs to sign in again.',
            'fix' => ['action' => 'reconnect', 'method' => 'POST', 'path' => '/api/agents/v2/connections/'.$c->provider.'/start',
                'message' => 'Reconnect '.$name.' in Connections.']];
    }
}
