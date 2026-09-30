<?php

namespace App\Services\AgentRuns;

use App\Models\AgentV2\Run;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * Account-only admission. It pins the teammate profile revision, the grant
 * snapshot and the selected AI account binding. It never quotes, reserves or
 * debits Vibes and never routes to Vibyra-funded inference.
 */
final class Admission
{
    public function __construct(private readonly RuntimeBindings $bindings, private readonly Grants $grants,
        private readonly Events $events) {}

    /** @return array{0: Run, 1: bool} the run and whether this call created it */
    public function admit(int $userId, array $data): array
    {
        $request = ['agentId' => $data['agentId'], 'prompt' => $data['prompt'],
            'attachments' => array_values($data['attachments'] ?? []), 'runtimeId' => $data['runtimeId'] ?? null];
        $hash = Canonical::hash($request);
        if ($existing = $this->existing($userId, $data['idempotencyKey'], $hash)) return [$existing, false];
        $agent = $this->grants->agent($userId, $data['agentId']);
        $binding = $this->bindings->select($userId, $request['runtimeId']);
        $snapshot = $this->grants->snapshot($userId, $agent->id);
        $online = $binding->last_seen_at && $binding->last_seen_at->isAfter(now()->subSeconds((int) config('agents_v2.online_seconds')));
        try {
            $run = DB::transaction(function () use ($userId, $data, $request, $hash, $agent, $binding, $snapshot, $online) {
                DB::table('agent_teammates')->where('id', $agent->id)->lockForUpdate()->first();
                $seq = (int) Run::query()->where('agent_id', $agent->id)->max('conversation_seq') + 1;
                $run = Run::query()->create(['user_id' => $userId, 'agent_id' => $agent->id,
                    'conversation_id' => $agent->chat_id, 'conversation_seq' => $seq, 'idempotency_key' => $data['idempotencyKey'],
                    'request_hash' => $hash, 'prompt' => $request['prompt'], 'attachments' => $request['attachments'],
                    'profile_revision' => (int) $agent->revision, 'grant_snapshot' => $snapshot,
                    'grant_hash' => Canonical::hash($snapshot), 'runtime_binding_id' => $binding->id,
                    'runtime_snapshot' => RuntimeBindings::snapshot($binding), 'funding_source' => 'connected_account',
                    'state' => $online ? RunStates::QUEUED : RunStates::WAITING_COMPUTER, 'event_seq' => 0]);
                $this->events->append($run, 'run.admitted', ['state' => $run->state, 'fundingSource' => 'connected_account',
                    'provider' => $binding->provider, 'model' => $binding->model, 'grants' => count($snapshot)]);
                return $run;
            });
        } catch (QueryException $e) {
            // A concurrent duplicate Send won the unique (user, idempotency key) race.
            if ($existing = $this->existing($userId, $data['idempotencyKey'], $hash)) return [$existing, false];
            throw $e;
        }
        return [$run, true];
    }

    private function existing(int $userId, string $key, string $hash): ?Run
    {
        $run = Run::query()->where('user_id', $userId)->where('idempotency_key', $key)->first();
        if ($run && !hash_equals($run->request_hash, $hash))
            ApiError::throw(409, 'idempotency_conflict', 'This request ID was already used for a different task.');
        return $run;
    }
}
