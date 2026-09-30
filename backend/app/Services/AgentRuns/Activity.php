<?php

namespace App\Services\AgentRuns;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The activity feed: every tool receipt across the account's teammates, newest
 * first, keyset-paginated by (created_at, receipt id). Owner-only by construction
 * (every row is joined through the owner's runs). Results/bodies are never
 * included, only the receipt summary.
 */
final class Activity
{
    public function page(int $userId, array $filters, int $limit): array
    {
        $limit = max(1, min(100, $limit));
        $query = DB::table('agent_receipts')
            ->join('agent_tool_actions', 'agent_tool_actions.id', '=', 'agent_receipts.action_id')
            ->join('agent_runs', 'agent_runs.id', '=', 'agent_receipts.run_id')
            ->leftJoin('agent_connections', 'agent_connections.id', '=', 'agent_tool_actions.connection_id')
            ->leftJoin('agent_teammates', 'agent_teammates.id', '=', 'agent_runs.agent_id')
            ->where('agent_runs.user_id', $userId)->where('agent_tool_actions.user_id', $userId);
        if (!empty($filters['agentId'])) $query->where('agent_runs.agent_id', $filters['agentId']);
        if (!empty($filters['provider'])) $query->where('agent_connections.provider', $filters['provider']);
        if ($cursor = $this->decode($filters['cursor'] ?? null)) {
            [$at, $id] = $cursor;
            $query->where(fn ($q) => $q->where('agent_receipts.created_at', '<', $at)
                ->orWhere(fn ($q) => $q->where('agent_receipts.created_at', $at)->where('agent_receipts.id', '<', $id)));
        }
        $rows = $query->orderByDesc('agent_receipts.created_at')->orderByDesc('agent_receipts.id')->limit($limit + 1)
            ->get(['agent_receipts.id', 'agent_receipts.action_id', 'agent_receipts.run_id', 'agent_receipts.status',
                'agent_receipts.outcome', 'agent_receipts.summary', 'agent_receipts.provider_resource_id', 'agent_receipts.provider_url',
                'agent_receipts.created_at', 'agent_receipts.updated_at', 'agent_tool_actions.tool', 'agent_tool_actions.kind',
                'agent_tool_actions.state as action_state', 'agent_tool_actions.connection_id', 'agent_connections.provider',
                'agent_connections.external_identity', 'agent_runs.agent_id', 'agent_teammates.name as agent_name']);
        $more = $rows->count() > $limit;
        $rows = $rows->take($limit);
        $last = $rows->last();
        return ['items' => $rows->map(fn ($r) => $this->item($r))->values()->all(),
            'nextCursor' => $more && $last ? $this->encode($last->created_at, $last->id) : null];
    }

    private function item(object $r): array
    {
        return ['id' => $r->id, 'actionId' => $r->action_id, 'runId' => $r->run_id, 'agentId' => $r->agent_id,
            'agentName' => $r->agent_name, 'tool' => $r->tool, 'kind' => $r->kind, 'provider' => $r->provider,
            'connectionId' => $r->connection_id, 'accountLabel' => $r->external_identity,
            'status' => $r->status, 'outcome' => $r->outcome, 'actionState' => $r->action_state, 'summary' => $r->summary,
            'providerResourceId' => $r->provider_resource_id, 'url' => $r->provider_url,
            'createdAt' => Carbon::parse($r->created_at)->toIso8601String(),
            'updatedAt' => $r->updated_at ? Carbon::parse($r->updated_at)->toIso8601String() : null];
    }

    private function encode(string $at, string $id): string
    {
        return rtrim(strtr(base64_encode($at.'|'.$id), '+/', '-_'), '=');
    }

    /** @return array{0: string, 1: string}|null */
    private function decode(?string $cursor): ?array
    {
        if (!$cursor) return null;
        $raw = base64_decode(strtr($cursor, '-_', '+/'), true);
        $parts = is_string($raw) ? explode('|', $raw, 2) : [];
        if (count($parts) !== 2 || !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/D', $parts[0]) || !preg_match('/^[0-9a-f-]{36}$/D', $parts[1]))
            ApiError::throw(422, 'invalid_cursor', 'That page link is no longer valid. Reload the activity.');
        return $parts;
    }
}
