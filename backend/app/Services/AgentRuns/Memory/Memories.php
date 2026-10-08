<?php

namespace App\Services\AgentRuns\Memory;

use App\Services\AgentRuns\ApiError;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Reviewable facts, never grants. Agent lock serializes duplicate/superseding mutations. */
final class Memories
{
    public function put(int $user, string $agent, string $scope, array $data, ?string $run = null): array
    {
        return DB::transaction(function () use ($user, $agent, $scope, $data, $run) {
            Scope::lock($user, $agent);
            $fact = trim($data['fact']);
            abort_if($fact === '' || mb_strlen($fact) > 1000, 422, 'Use a fact of 1–1000 characters.');
            $fingerprint = Scope::fingerprint($fact);
            $q = Scope::query($user, $agent, $scope);
            $existing = (clone $q)->where('fingerprint', $fingerprint)->orderByDesc('created_at')->first();
            // Automatic capture cannot resurrect forgotten or superseded content.
            if ($existing && ($run || in_array($existing->status, ['pending', 'active']))) return Scope::payload($existing);
            $full = (clone $q)->whereIn('status', ['active', 'pending'])->count() >= 200;
            if ($full && $run) return []; // An optional suggestion must not block an otherwise valid task.
            abort_if($full, 422, 'Review or forget memories before adding more.');
            $source = $data['sourceKind'] ?? 'user';
            $status = $run || $source === 'document' ? 'pending' : 'active';
            $key = trim($data['key'] ?? '') ?: substr($fingerprint, 0, 32);
            if ($status === 'active') $this->supersede($user, $agent, $scope, $key);
            $id = (string) Str::uuid();
            DB::table('agent_memories')->insert(['id' => $id, 'user_id' => $user, 'agent_id' => $agent,
                'account_scope' => $scope, 'key' => $key, 'fact' => $fact, 'fingerprint' => $fingerprint,
                'source_kind' => $source, 'source_label' => $run ? 'Your task · review suggested memory' : ($source === 'document' ? 'Document suggestion' : 'You'),
                'source_run_id' => $run, 'status' => $status, 'revision' => 1,
                'expires_at' => isset($data['expiresAt']) ? \Carbon\Carbon::parse($data['expiresAt']) : null,
                'created_at' => now(), 'updated_at' => now()]);
            return Scope::payload((clone $q)->where('id', $id)->first());
        });
    }

    public function change(int $user, string $agent, string $scope, string $id, array $data): array
    {
        return DB::transaction(function () use ($user, $agent, $scope, $id, $data) {
            Scope::lock($user, $agent);
            $q = Scope::query($user, $agent, $scope)->where('id', $id);
            $m = (clone $q)->first();
            if (!$m) ApiError::throw(404, 'memory_not_found', 'That memory does not exist.');
            if ((int) $m->revision !== (int) $data['revision']) ApiError::throw(409, 'memory_changed', 'This memory changed. Reload before reviewing it.');
            abort_if($m->status === 'forgotten', 409, 'This memory has been forgotten.');
            $action = $data['action'];
            $fields = ['revision' => $m->revision + 1, 'updated_at' => now()];
            if ($action === 'accept') {
                abort_unless($m->status === 'pending', 409, 'Only a suggested memory can be accepted.');
                abort_if($m->expires_at && \Carbon\Carbon::parse($m->expires_at)->isPast(), 409, 'This memory has expired.');
                $this->supersede($user, $agent, $scope, $m->key, $id);
                $fields['status'] = 'active';
            } elseif ($action === 'undo') {
                abort_unless($m->status === 'active', 409, 'Only an active memory can be undone.');
                $fields += ['status' => 'pending', 'invalidated_at' => now()];
            } elseif ($action === 'correct') {
                $fact = trim($data['fact'] ?? '');
                abort_if($fact === '' || mb_strlen($fact) > 1000, 422, 'Use a fact of 1–1000 characters.');
                $this->supersede($user, $agent, $scope, $m->key, $id);
                if (!hash_equals($m->fingerprint, Scope::fingerprint($fact))) {
                    // A future repeated Remember request must not revive the corrected-away value.
                    DB::table('agent_memories')->insert(['id' => (string) Str::uuid(), 'user_id' => $user, 'agent_id' => $agent,
                        'account_scope' => $scope, 'key' => '', 'fact' => '', 'fingerprint' => $m->fingerprint,
                        'source_kind' => $m->source_kind, 'source_label' => 'Corrected', 'source_run_id' => $m->source_run_id,
                        'status' => 'forgotten', 'revision' => 1, 'invalidated_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
                }
                $fields += ['fact' => $fact, 'fingerprint' => Scope::fingerprint($fact), 'status' => 'active',
                    'source_kind' => 'user', 'source_label' => 'You · corrected', 'expires_at' => null, 'invalidated_at' => now()];
            } else {
                $fields += ['fact' => '', 'key' => '', 'source_label' => 'Forgotten', 'status' => 'forgotten', 'invalidated_at' => now()];
            }
            $q->update($fields);
            return Scope::payload((clone $q)->first());
        });
    }

    private function supersede(int $user, string $agent, string $scope, string $key, ?string $except = null): void
    {
        Scope::query($user, $agent, $scope)->where('key', $key)->whereIn('status', ['active', 'pending'])
            ->when($except, fn ($q) => $q->where('id', '!=', $except))
            ->update(['status' => 'superseded', 'revision' => DB::raw('revision + 1'), 'invalidated_at' => now(), 'updated_at' => now()]);
    }
}
