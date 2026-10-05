<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Connection;
use App\Models\AgentV2\Grant;
use App\Services\AgentRuns\Tools\ToolCatalog;
use App\Services\Platform\AccountActivity;
use Illuminate\Support\Facades\DB;

/** Revisioned per-teammate access to one connection. Connected status alone never grants. */
final class Grants
{
    /** Words that, in the person's own task or brief, name a service plainly enough to grant it (only if it is connected). */
    private const ASKED = [
        'gmail' => ['gmail', 'google mail', 'email', 'emails', 'e-mail', 'mail', 'inbox'],
        'outlook_mail' => ['outlook', 'email', 'emails', 'e-mail', 'mail', 'inbox'],
        'google_calendar' => ['google calendar', 'calendar', 'meeting', 'meetings', 'schedule', 'agenda'],
        'outlook_calendar' => ['outlook calendar', 'calendar', 'meeting', 'meetings', 'schedule', 'agenda'],
        'google_drive' => ['google drive', 'drive', 'google docs', 'document', 'documents'],
        'google_tasks' => ['google tasks', 'to-do', 'todo', 'todos', 'task list'],
        'github' => ['github', 'repo', 'repository', 'repositories', 'pull request', 'pull requests'],
        'slack' => ['slack'], 'notion' => ['notion'], 'linear' => ['linear'], 'figma' => ['figma'], 'stripe' => ['stripe'],
    ];

    public function __construct(private readonly ToolCatalog $catalog) {}

    public function put(int $userId, string $agentId, Connection $connection, array $operations): Grant
    {
        $this->agent($userId, $agentId);
        if ($connection->revoked_at) ApiError::throw(409, 'connection_revoked', 'That connection was removed.');
        if ($connection->provider === 'browser')
            ApiError::throw(409, 'browser_grant_sites', 'Choose this teammate\'s allowed sites in its browser access.');
        if ($connection->provider === 'computer')
            ApiError::throw(409, 'computer_grant_local', 'Choose what this teammate may do with a computer folder on that Mac.');
        $allowed = $this->catalog->operations($connection->provider);
        $ops = array_values(array_unique(array_filter($operations, 'is_string')));
        sort($ops);
        if ($ops === [] || array_diff($ops, $allowed) !== [])
            ApiError::throw(422, 'invalid_operations', 'Choose operations this connection offers: '.implode(', ', $allowed).'.');
        return DB::transaction(function () use ($userId, $agentId, $connection, $ops) {
            // Serialize grants on this connection: with no grant row yet there is nothing to lock, so two
            // first grants used to each insert one (and a later edit changed only one of them).
            $locked = DB::table('agent_connections')->where('id', $connection->id)->lockForUpdate()->first();
            if (!$locked || $locked->revoked_at) ApiError::throw(409, 'connection_revoked', 'That connection was removed.');
            $grant = Grant::query()->where('user_id', $userId)->where('agent_id', $agentId)
                ->where('connection_id', $connection->id)->whereNull('revoked_at')->lockForUpdate()->first();
            if ($grant && $grant->operations === $ops) return $grant;
            $detail = ['provider' => $connection->provider, 'operations' => $ops];
            if ($grant) {
                $grant->forceFill(['operations' => $ops, 'revision' => $grant->revision + 1])->save();
                AccountActivity::record($userId, 'grant.changed', $detail);
                return $grant;
            }
            $created = Grant::query()->create(['user_id' => $userId, 'agent_id' => $agentId,
                'connection_id' => $connection->id, 'operations' => $ops, 'revision' => 1]);
            AccountActivity::record($userId, 'grant.changed', $detail);
            return $created;
        });
    }

    public function revoke(int $userId, string $agentId, string $connectionId): void
    {
        $changed = Grant::query()->where('user_id', $userId)->where('agent_id', $agentId)->where('connection_id', $connectionId)
            ->whereNull('revoked_at')->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
        if ($changed > 0) AccountActivity::record($userId, 'grant.revoked', ['connection' => $connectionId]);
    }

    public function revokeForConnection(string $connectionId): void
    {
        Grant::query()->where('connection_id', $connectionId)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'revision' => DB::raw('revision + 1'), 'updated_at' => now()]);
    }

    /** @return Grant[] active grants on active connections */
    public function active(int $userId, string $agentId): array
    {
        return Grant::query()->where('agent_grants.user_id', $userId)->where('agent_id', $agentId)
            ->whereNull('agent_grants.revoked_at')
            ->join('agent_connections', 'agent_connections.id', '=', 'agent_grants.connection_id')
            ->whereNull('agent_connections.revoked_at')
            ->orderBy('agent_connections.created_at')->orderBy('agent_grants.id')
            ->get(['agent_grants.*', 'agent_connections.generation as connection_generation'])->all();
    }

    /**
     * Pinned into a run at admission; tool calls need both this and the current grant. `$admitting` first turns the
     * Access list (and `$asked`, see adoptAccessList) into grants; a plan preview never grants.
     */
    public function snapshot(int $userId, string $agentId, bool $admitting = false, ?string $asked = null): array
    {
        if ($admitting) $this->adoptAccessList($userId, $this->agent($userId, $agentId), $asked);
        return array_map(fn (Grant $g) => ['grantId' => $g->id, 'connectionId' => $g->connection_id,
            'revision' => $g->revision, 'generation' => (int) $g->connection_generation,
            'operations' => $g->operations], $this->active($userId, $agentId));
    }

    /**
     * The teammate's Access list (`agent_teammates.integrations`, what the phone's teammate setup saves) becomes a grant
     * on each matching connected account, once per connection: a grant the person later removes is not brought back,
     * and a reconnect (a new connection) is granted again. `$asked` is the person's own request typed in the app (never a
     * schedule, trigger or API run): a connected service it or the brief plainly names is granted too, but only when it
     * is the one account of that service and the teammate has never held that service. Without this an "Email"
     * teammate ran with no Gmail tools.
     */
    private function adoptAccessList(int $userId, object $agent, ?string $asked): void
    {
        $listed = array_values(array_filter((array) json_decode((string) ($agent->integrations ?? '[]'), true), 'is_string'));
        $requested = [];
        if ($asked !== null) {
            $text = Tools\Relevance::normalize($asked.' '.($agent->brief ?? ''));
            foreach (self::ASKED as $provider => $words) if (Tools\Relevance::mentions($text, $words)) $requested[] = $provider;
            $requested = array_values(array_diff($requested, $listed));
        }
        if ($listed === [] && $requested === []) return;
        Connections\LegacyInstalls::sync($userId);
        $connections = Connection::query()->where('user_id', $userId)->whereIn('provider', [...$listed, ...$requested])
            ->whereNull('revoked_at')->get();
        foreach ($connections as $connection) {
            $ops = $this->catalog->operations($connection->provider);
            if ($ops === [] || Grant::query()->where('agent_id', $agent->id)->where('connection_id', $connection->id)->exists()) continue;
            if (in_array($connection->provider, $requested, true) && !$this->unambiguous($userId, $agent->id, $connection->provider)) continue;
            rescue(fn () => $this->put($userId, $agent->id, $connection, $ops));
        }
    }

    /** One connected account of this service, and no grant on any of its accounts ever (a removal is a decision). */
    private function unambiguous(int $userId, string $agentId, string $provider): bool
    {
        $ids = Connection::query()->where('user_id', $userId)->where('provider', $provider)->pluck('id');
        $active = Connection::query()->whereIn('id', $ids)->whereNull('revoked_at')->count();
        return $active === 1 && !Grant::query()->where('agent_id', $agentId)->whereIn('connection_id', $ids)->exists();
    }

    public function payload(Grant $g): array
    {
        return ['id' => $g->id, 'agentId' => $g->agent_id, 'connectionId' => $g->connection_id,
            'operations' => $g->operations, 'revision' => $g->revision,
            'revokedAt' => $g->revoked_at?->toIso8601String()];
    }

    public function agent(int $userId, string $agentId): object
    {
        $agent = DB::table('agent_teammates')->where('user_id', $userId)->where('id', $agentId)->first();
        if (!$agent) ApiError::throw(404, 'agent_not_found', 'That teammate does not exist.');
        if ($agent->archived_at) ApiError::throw(409, 'agent_archived', 'Restore this teammate first.');
        return $agent;
    }
}
