<?php
namespace App\Services\AgentRuns\Cloud;

use App\Models\{AgentV2\Run, AgentV2\RuntimeBinding, VibyraSession};
use App\Services\AgentRuns\{Events, Lifecycle, RunStates};
use App\Services\CloudComputer\Wake;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** No inference here: wake the existing metered computer from a finite saved grant. */
final class WakePending
{
    public function tick(): int
    {
        if (!config('agents_v2.cloud_enabled')) return 0;
        $ids = Run::whereIn('state', RunStates::CLAIMABLE)->whereNull('cancel_requested_at')
            ->where(fn ($q) => $q->whereNull('lease_expires_at')->orWhere('lease_expires_at', '<', now()))
            ->whereIn('runtime_binding_id', RuntimeBinding::where('execution_target', 'cloud')->select('id'))
            ->orderBy('created_at')->limit(100)->pluck('id');
        foreach ($ids as $id) $this->run($id);
        return $ids->count();
    }

    public function run(string $id): void
    {
        $run = Run::find($id);
        if (!$run || !in_array($run->state, RunStates::CLAIMABLE, true) || $run->cancel_requested_at) return;
        $b = RuntimeBinding::find($run->runtime_binding_id);
        if (!$b || !Authority::cloud($b)) return;
        if (($run->runtime_snapshot['provider'] ?? null) !== $b->provider || ($run->runtime_snapshot['accountRef'] ?? null) !== $b->account_ref
            || ($run->runtime_snapshot['model'] ?? null) !== $b->model || ($run->runtime_snapshot['effort'] ?? null) !== $b->effort) return;
        try {
            DB::transaction(function () use ($b, $id) {
                app(\App\Services\Vibes\Wallet::class)->lock($b->user_id);
                $b->refresh();
                $w = DB::table('cloud_workspaces')->where('id', $b->cloud_workspace_id)->where('user_id', $b->user_id)->lockForUpdate()->firstOrFail();
                $p = app(Policies::class)->current($b, true);
                $run = Run::whereKey($id)->lockForUpdate()->first();
                if (!$run || $run->cancel_requested_at || !in_array($run->state, RunStates::CLAIMABLE, true)
                    || ($run->runtime_snapshot['accountRef'] ?? null) !== $b->account_ref || ($run->runtime_snapshot['provider'] ?? null) !== $b->provider || ($run->runtime_snapshot['model'] ?? null) !== $b->model
                    || ($run->runtime_snapshot['effort'] ?? null) !== $b->effort) return;
                // Sign-in and inference limits need an account change or actual reset, not repeated paid boots.
                if (in_array($run->state, [RunStates::WAITING_SIGNIN, RunStates::PAUSED_LIMITS], true)
                    && $run->wait_revision === $b->revision && (!$run->resume_after || $run->resume_after->isFuture())) return;
                if (in_array($w->state, ['ready', 'starting'], true)) return;
                if ($p->last_attempt_at && now()->lt(\Illuminate\Support\Carbon::parse($p->last_attempt_at)->addMinute())) return;
                $q = json_decode($p->quote, true, 32, JSON_THROW_ON_ERROR);
                app(Policies::class)->samePrice($q, $w);
                abort_unless($p->used_starts < $p->max_starts && $p->reserved_budget_units + $q['budgetUnits'] <= $p->total_budget_units
                    && $p->reserved_seconds + $q['deadlineSeconds'] <= $p->total_seconds, 402, 'Cloud Agent allowance reached. Review the compute limits.');
                $session = VibyraSession::findOrFail($p->session_id);
                $grant = ComputeGrant::fromPolicy($b, $w);
                DB::table('agent_cloud_policies')->where('user_id', $b->user_id)->update([
                    'used_starts' => $p->used_starts + 1, 'reserved_budget_units' => $p->reserved_budget_units + $q['budgetUnits'],
                    'reserved_seconds' => $p->reserved_seconds + $q['deadlineSeconds'], 'last_attempt_at' => now(), 'updated_at' => now()]);
                app(Wake::class)->wake($session, [], $grant);
                app(Events::class)->append($run, 'cloud.waking', ['workspaceId' => $w->id, 'policyRevision' => $p->revision]);
            }, 5);
        } catch (\Illuminate\Http\Exceptions\HttpResponseException|\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            $this->pause($id, $b, $e);
        }
    }

    private function pause(string $id, RuntimeBinding $b, \Throwable $error): void
    {
        DB::transaction(function () use ($id, $b, $error) {
            $r = Run::whereKey($id)->lockForUpdate()->first();
            if (!$r || RunStates::terminal($r->state) || $r->cancel_requested_at || $r->lease_expires_at?->isFuture()) return;
            $reason = $error instanceof \Illuminate\Http\Exceptions\HttpResponseException
                ? ($error->getResponse()->getData(true)['error'] ?? 'Cloud setup needs attention.') : $error->getMessage();
            $r->forceFill(['wait_revision' => $b->revision, 'resume_after' => null, 'lease_expires_at' => null])->save();
            if ($r->state !== RunStates::PAUSED_LIMITS) app(Lifecycle::class)->move($r, RunStates::PAUSED_LIMITS, mb_substr($reason, 0, 500));
        });
    }
}
