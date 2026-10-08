<?php
namespace App\Services\AgentRuns\Cloud;

use App\Models\{AgentV2\RuntimeBinding, VibyraSession};
use App\Services\AgentRuns\{ApiError, RuntimeBindings};
use App\Services\CloudComputer\{AccessProviders, Computers, ConnectConsent};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Explicit, finite authority. Saved compute limits are never an inference budget. */
final class Policies
{
    public function save(VibyraSession $session, array $d): array
    {
        return DB::transaction(function () use ($session, $d) {
            app(\App\Services\Vibes\Wallet::class)->lock($session->user_id);
            $this->enabled();
            $user = (int) $session->user_id;
            abort_unless(app(ConnectConsent::class)->connected($user), 409, 'Connect your cloud computer first.');
            abort_unless(app(AccessProviders::class)->enabled($user, 'claude'), 409, 'Claude is disabled for your cloud computer.');
            $w = app(Computers::class)->find($user);
            abort_unless($w && $w->terms_accepted_at, 409, 'Review and accept Cloud storage terms before enabling unattended Agents.');
            app(Accounts::class)->requireSelection($w, $d);
            $q = DB::table('agent_cloud_quotes')->where('id', $d['quoteId'])->where('user_id', $user)
                ->where('workspace_id', $w->id)->where('session_id', $session->id)->where('device_id', $d['deviceId'])->first();
            abort_unless($q && !$q->accepted_at && now()->lt($q->expires_at), 409, 'Review a fresh compute quote for this account and device.');
            $p = json_decode($q->payload, true, 32, JSON_THROW_ON_ERROR);
            abort_unless(app(\App\Services\Vibes\Wallet::class)->planFor($user) === 'pro_v2', 403, 'Unattended Agents require Pro.');
            $this->samePrice($p, $w);
            abort_unless($d['totalBudgetUnits'] >= $p['budgetUnits'] && $d['totalSeconds'] >= $p['deadlineSeconds'], 422, 'Total allowance must cover at least one wake.');
            $old = DB::table('agent_cloud_policies')->where('user_id', $user)->lockForUpdate()->first();
            abort_unless((int) ($old->revision ?? 0) === (int) $d['expectedRevision'], 409, 'Cloud Agent settings changed. Refresh before saving.');
            $binding = $old ? RuntimeBinding::find($old->runtime_binding_id) : null;
            if ($binding && ($binding->account_ref !== $d['accountId'] || $binding->model !== $d['model'] || $binding->effort !== ($d['effort'] ?? null))) {
                $binding->forceFill(['revoked_at' => now(), 'last_seen_at' => null])->save();
                $binding = null; // A saved runtime ID can never silently retarget a queued send or routine.
            }
            $values = ['provider' => 'claude', 'account_ref' => $d['accountId'], 'model' => $d['model'], 'effort' => $d['effort'] ?? null,
                'execution_target' => 'cloud', 'cloud_workspace_id' => $w->id, 'cloud_generation' => null,
                'capabilities' => ['controlledTools' => true, 'taskSteering' => true], 'runner_key_hash' => hash('sha256', Str::random(64)),
                'last_seen_at' => null, 'revoked_at' => null];
            if ($binding) $binding->forceFill($values + ['revision' => $binding->revision + 1])->save();
            else $binding = RuntimeBinding::create($values + ['user_id' => $user, 'host_id' => hash('sha256', 'agent-cloud:'.$w->id), 'revision' => 1]);
            DB::table('agent_cloud_policies')->updateOrInsert(['user_id' => $user], ['workspace_id' => $w->id,
                'runtime_binding_id' => $binding->id, 'session_id' => $session->id, 'device_id' => $d['deviceId'], 'quote' => json_encode($p),
                'max_starts' => $d['maxStarts'], 'used_starts' => 0, 'total_budget_units' => $d['totalBudgetUnits'], 'reserved_budget_units' => 0,
                'total_seconds' => $d['totalSeconds'], 'reserved_seconds' => 0, 'expires_at' => $d['expiresAt'], 'revoked_at' => null,
                'revision' => ($old->revision ?? 0) + 1, 'last_attempt_at' => null, 'created_at' => $old->created_at ?? now(), 'updated_at' => now()]);
            DB::table('agent_cloud_quotes')->where('id', $q->id)->update(['accepted_at' => now()]);
            return $this->payload($user);
        }, 5);
    }

    public function enabled(): void
    {
        if (!config('agents_v2.cloud_enabled')) ApiError::throw(503, 'cloud_agents_disabled', 'Cloud Agents are not enabled yet.');
    }

    public function current(RuntimeBinding $b, bool $lock = false): object
    {
        $this->enabled();
        $p = DB::table('agent_cloud_policies')->where('user_id', $b->user_id)->where('runtime_binding_id', $b->id)
            ->when($lock, fn ($q) => $q->lockForUpdate())->first();
        $s = $p ? VibyraSession::find($p->session_id) : null;
        if ($b->revoked_at || !$p || $p->revoked_at || now()->gte($p->expires_at) || !$s || $s->revoked_at
            || !$s->absolute_expires_at || $s->absolute_expires_at->isPast() || !$s->idle_expires_at || $s->idle_expires_at->isPast()
            || !app(Accounts::class)->selected($b) || !app(ConnectConsent::class)->connected($b->user_id) || !app(AccessProviders::class)->enabled($b->user_id, $b->provider))
            ApiError::throw(409, 'cloud_authority_expired', 'Cloud authority expired or was withdrawn. Review Cloud Agent setup.');
        return $p;
    }

    public function samePrice(array $p, object $w): void
    {
        foreach (app(ComputeQuotes::class)->price($w) as $k => $v)
            abort_unless(($p[$k] ?? null) === $v, 409, 'Cloud price or resources changed. Review a fresh quote.');
    }

    public function revoke(int $user, int $revision): void
    {
        DB::transaction(function () use ($user, $revision) {
            app(\App\Services\Vibes\Wallet::class)->lock($user);
            $p = DB::table('agent_cloud_policies')->where('user_id', $user)->lockForUpdate()->first();
            if (!$p) return;
            abort_unless((int) $p->revision === $revision, 409, 'Cloud Agent settings changed. Refresh before revoking.');
            DB::table('agent_cloud_policies')->where('user_id', $user)->update(['revoked_at' => now(), 'revision' => $p->revision + 1, 'updated_at' => now()]);
            RuntimeBinding::whereKey($p->runtime_binding_id)->update(['revoked_at' => now(), 'last_seen_at' => null, 'revision' => DB::raw('revision + 1')]);
        });
    }

    private function label(RuntimeBinding $b): string
    {
        $row = DB::table('agent_cloud_accounts')->where('workspace_id', $b->cloud_workspace_id)->first();
        $a = $row ? collect(json_decode($row->accounts, true))->firstWhere('accountId', $b->account_ref) : null;
        return $a['label'] ?? 'Claude Cloud account';
    }

    public function payload(int $user): array
    {
        $p = DB::table('agent_cloud_policies')->where('user_id', $user)->first();
        $b = $p ? RuntimeBinding::find($p->runtime_binding_id) : null;
        if (!$p || !$b) return ['policy' => null, 'enabled' => (bool) config('agents_v2.cloud_enabled'), 'requiresSetup' => true];
        $active = !$b->revoked_at;
        try { $this->current($b); } catch (\Throwable) { $active = false; }
        return ['enabled' => (bool) config('agents_v2.cloud_enabled'), 'requiresSetup' => !$active, 'policy' => [
            'runtimeId' => $b->id, 'workspaceId' => $p->workspace_id, 'provider' => $b->provider, 'accountId' => $b->account_ref,
            'accountLabel' => $this->label($b), 'model' => $b->model, 'effort' => $b->effort, 'expiresAt' => \Illuminate\Support\Carbon::parse($p->expires_at)->toIso8601String(),
            'revision' => $p->revision, 'enabled' => $active, 'remainingStarts' => max(0, $p->max_starts - $p->used_starts),
            'remainingBudgetUnits' => max(0, $p->total_budget_units - $p->reserved_budget_units),
            'remainingSeconds' => max(0, $p->total_seconds - $p->reserved_seconds), 'quote' => json_decode($p->quote, true)]];
    }
}
