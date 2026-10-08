<?php
namespace App\Services\AgentRuns\Cloud;

use Illuminate\Support\Facades\DB;

/** Runtime-observed account metadata only; never bearer tokens or credential files. */
final class Accounts
{
    public function report(object $w, array $accounts): void
    {
        DB::table('agent_cloud_accounts')->updateOrInsert(['workspace_id' => $w->id], [
            'generation' => $w->generation, 'accounts' => json_encode(array_map(fn ($a) => array_intersect_key($a, array_flip(['provider', 'accountId', 'label', 'authenticated', 'models', 'efforts'])), $accounts)), 'reported_at' => now()]);
    }

    public function list(?object $w): array
    {
        if (!$w) return [];
        $r = DB::table('agent_cloud_accounts')->where('workspace_id', $w->id)->first();
        if (!$r) return [];
        $fresh = $r->generation === $w->generation && $w->state === 'ready' && now()->lt(\Illuminate\Support\Carbon::parse($r->reported_at)->addSeconds(120));
        return array_map(fn ($a) => [...$a, 'online' => $fresh], json_decode($r->accounts, true, 32, JSON_THROW_ON_ERROR));
    }

    public function selected(\App\Models\AgentV2\RuntimeBinding $b, ?int $generation = null): bool
    {
        $r = DB::table('agent_cloud_accounts')->where('workspace_id', $b->cloud_workspace_id)->first();
        if (!$r || ($generation !== null && (int) $r->generation !== $generation)) return false;
        return collect(json_decode($r->accounts, true, 32, JSON_THROW_ON_ERROR))->contains(fn ($a) =>
            $a['provider'] === $b->provider && $a['accountId'] === $b->account_ref && $a['authenticated']);
    }

    public function requireSelection(object $w, array $d): void
    {
        $match = collect($this->list($w))->first(fn ($a) => $a['provider'] === $d['provider'] && $a['accountId'] === $d['accountId']);
        abort_unless($match && $match['online'] && $match['authenticated'], 409, 'Wake Cloud and sign into the selected AI account before setup.');
        abort_unless(in_array($d['model'], $match['models'], true) && (empty($d['effort']) || in_array($d['effort'], $match['efforts'], true)), 422, 'The cloud account does not advertise that model or effort.');
    }
}
