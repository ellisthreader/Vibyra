<?php
namespace App\Services\AgentRuns\Cloud;

use App\Models\AgentV2\RuntimeBinding;
use Illuminate\Support\Str;

final class Registration
{
    public function next(object $w): ?array
    {
        $b = RuntimeBinding::where('user_id', $w->user_id)->where('cloud_workspace_id', $w->id)->whereNull('revoked_at')->first();
        if (!$b) return null;
        try { app(Policies::class)->current($b); } catch (\Throwable) { return null; }
        return ['runtimeId' => $b->id, 'provider' => $b->provider, 'accountId' => $b->account_ref,
            'model' => $b->model, 'effort' => $b->effort, 'revision' => $b->revision];
    }

    public function register(object $w, array $d): array
    {
        abort_unless($w->state === 'ready' && $w->lease_until && now()->lt($w->lease_until) && (int) $w->generation === $d['generation'], 409, 'Cloud compute authority expired.');
        $s = $this->next($w);
        abort_unless($s && $s['runtimeId'] === $d['runtimeId'], 409, 'Choose a Cloud AI account first.');
        foreach (['provider', 'accountId', 'model', 'effort'] as $key)
            abort_unless(($s[$key] ?? null) === ($d[$key] ?? null), 409, 'Cloud account selection changed.');
        app(Accounts::class)->requireSelection($w, $d);
        $b = RuntimeBinding::whereKey($s['runtimeId'])->lockForUpdate()->firstOrFail();
        $key = Str::random(64);
        $b->forceFill(['runner_key_hash' => hash('sha256', $key), 'cloud_generation' => $w->generation, 'last_seen_at' => now(),
            'provider_version' => $d['providerVersion'] ?? null, 'capabilities' => ['controlledTools' => true, 'taskSteering' => true]])->save();
        return ['runtimeId' => $b->id, 'runnerKey' => $key, 'selection' => $s];
    }
}
