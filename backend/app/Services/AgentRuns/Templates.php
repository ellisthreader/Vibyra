<?php

namespace App\Services\AgentRuns;

use App\Services\AgentRuns\Tools\ToolCatalog;
use App\Services\AgentRuns\Tools\Providers\Adapters;
use App\Services\Agents\Teammates;

/**
 * Starter teammates (config/agents_v2_templates.php). Listing marks which
 * suggested services this account has connected; creating one saves only the
 * teammate profile. Grants, schedules and triggers are never created here.
 */
final class Templates
{
    public function __construct(private readonly ToolCatalog $catalog, private readonly Adapters $adapters,
        private readonly Connections\Connections $connections) {}

    public function list(int $userId): array
    {
        $connected = array_count_values(array_map(fn ($c) => $c->provider, $this->connections->active($userId)));
        return array_map(fn ($key) => $this->payload($key, $connected), array_keys((array) config('agents_v2_templates')));
    }

    public function payload(string $key, array $connected = []): array
    {
        $t = $this->find($key);
        return ['key' => $key, 'name' => $t['name'], 'avatar' => $t['avatar'], 'brief' => $t['brief'],
            'suggested' => [
                'providers' => array_map(fn ($p) => ['provider' => $p['provider'], 'name' => $this->adapters->name($p['provider']),
                    // Only operations this backend really brokers; never granted automatically.
                    'operations' => array_map(fn ($op) => ['tool' => $op, 'kind' => $this->catalog->kind($op)],
                        array_values(array_intersect($p['operations'], $this->catalog->operations($p['provider'])))),
                    'why' => $p['why'], 'connected' => ($connected[$p['provider']] ?? 0) > 0], $t['providers']),
                'schedule' => $t['schedule'], 'trigger' => $t['trigger']],
            'autoGrant' => false];
    }

    /** Creates the teammate profile only; `id` makes a retried create idempotent. */
    public function create(int $userId, string $key, string $id, ?string $name): array
    {
        $t = $this->find($key);
        return app(Teammates::class)->save($userId, ['id' => $id, 'name' => $name ?: $t['name'], 'brief' => $t['brief'],
            'avatar' => $t['avatar'], 'memory' => '', 'budget' => 10, 'integrations' => []]);
    }

    private function find(string $key): array
    {
        $t = config('agents_v2_templates.'.$key);
        if (!is_array($t)) ApiError::throw(404, 'template_not_found', 'That starter teammate does not exist.');
        return $t;
    }
}
