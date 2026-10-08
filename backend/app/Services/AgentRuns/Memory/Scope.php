<?php

namespace App\Services\AgentRuns\Memory;

use App\Models\AgentV2\RuntimeBinding;
use App\Services\AgentRuns\{ApiError, Canonical, RuntimeBindings};
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class Scope
{
    public static function resolve(int $user, string $agent, ?string $runtime): RuntimeBinding
    {
        if (!DB::table('agent_teammates')->where('user_id', $user)->where('id', $agent)->exists())
            ApiError::throw(404, 'agent_not_found', 'That teammate does not exist.');
        // Reviewing/forgetting saved Cloud memory never grants compute or account use.
        if ($runtime && ($cloud = RuntimeBinding::whereKey($runtime)->where('user_id', $user)->where('execution_target', 'cloud')->first())) return $cloud;
        return app(RuntimeBindings::class)->select($user, $runtime);
    }

    public static function hash(array $snapshot): string
    {
        return Canonical::hash([$snapshot['provider'] ?? '', $snapshot['accountRef'] ?? '']);
    }

    public static function query(int $user, string $agent, string $scope): Builder
    {
        return DB::table('agent_memories')->where('user_id', $user)->where('agent_id', $agent)->where('account_scope', $scope);
    }

    public static function lock(int $user, string $agent): void
    {
        DB::table('agent_teammates')->where('user_id', $user)->where('id', $agent)->lockForUpdate()->firstOrFail();
    }

    public static function fingerprint(string $fact): string
    {
        return hash('sha256', mb_strtolower(trim(preg_replace('/\s+/u', ' ', $fact))));
    }

    public static function payload(object $m): array
    {
        $expired = $m->expires_at && \Carbon\Carbon::parse($m->expires_at)->isPast();
        return ['id' => $m->id, 'fact' => $m->fact, 'key' => $m->key, 'sourceKind' => $m->source_kind,
            'sourceLabel' => $m->source_label, 'sourceRunId' => $m->source_run_id,
            'status' => $expired && $m->status === 'active' ? 'expired' : $m->status, 'revision' => (int) $m->revision,
            'createdAt' => $m->created_at, 'updatedAt' => $m->updated_at, 'expiresAt' => $m->expires_at];
    }
}
