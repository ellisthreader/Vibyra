<?php
namespace App\Services\CloudWorkspaces;

use App\Services\Membership\Allowances;
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Called only with the account wallet lock held. Same grants as AI turns. */
final class Reservations
{
    public function reserve(object $workspace, int $amount): object
    {
        abort_unless($amount > 0, 422);
        abort_if(DB::table('cloud_reservations')->where('workspace_id', $workspace->id)->whereNull('settled_at')->exists(), 409, 'Settle the previous runtime reservation first.');
        app(Allowances::class)->expire($workspace->user_id);
        app(Budgets::class)->guard($workspace, $amount);
        $left = $amount; $allocations = [];
        $grants = DB::table('vibes_grants')->where('user_id', $workspace->user_id)->whereNull('revoked_at')
            ->where('kind', '!=', 'trial')->orderBy('id')->get();
        foreach ($grants as $g) {
            $take = min($left, (int) $g->remaining);
            if ($take <= 0) continue;
            DB::table('vibes_grants')->where('id', $g->id)->decrement('remaining', $take);
            $allocations[] = ['id' => $g->id, 'amount' => $take];
            $left -= $take;
        }
        abort_if($left > 0, 402, 'More paid tokens are needed to keep this computer running.');
        $id = (string) Str::uuid();
        DB::table('cloud_reservations')->insert(['id' => $id, 'user_id' => $workspace->user_id, 'workspace_id' => $workspace->id,
            'generation' => $workspace->generation, 'reserved' => $amount, 'tariff_version' => $workspace->tariff_version,
            'units_per_hour' => $workspace->units_per_hour, 'provider_micro_per_hour' => $workspace->provider_micro_per_hour,
            'allocations' => json_encode($allocations), 'created_at' => now(), 'updated_at' => now()]);
        $day = now()->toDateString();
        DB::table('vibes_spend_days')->insertOrIgnore(['day' => $day]);
        $d = DB::table('vibes_spend_days')->where('day', $day)->lockForUpdate()->first();
        abort_if($d->held + $d->spent + $amount > config('cloud_workspaces.daily_micro_limit'), 503, 'Hosted computing is at capacity.');
        DB::table('vibes_spend_days')->where('day', $day)->increment('held', $amount);
        app(Wallet::class)->record($workspace->user_id, 'cloud-hold:'.$id, 'cloud_hold', -$amount, ['workspaceId' => $workspace->id]);
        return DB::table('cloud_reservations')->where('id', $id)->first();
    }

    public function settle(object $reservation, int $wanted, int $actualMicro): int
    {
        $r = DB::table('cloud_reservations')->where('id', $reservation->id)->firstOrFail();
        if ($r->settled_at) return (int) $r->charged;
        app(Allowances::class)->expire($r->user_id);
        $charge = min((int) $r->reserved, max(0, $wanted)); $left = $charge; $returned = 0;
        foreach (json_decode($r->allocations, true) as $a) {
            $used = min($left, $a['amount']); $left -= $used;
            $release = $a['amount'] - $used;
            if (DB::table('vibes_grants')->where('id', $a['id'])->whereNull('revoked_at')->increment('remaining', $release)) $returned += $release;
        }
        DB::table('cloud_reservations')->where('id', $r->id)->update(['charged' => $charge, 'actual_micro_usd' => max(0, $actualMicro),
            'settled_at' => now(), 'updated_at' => now()]);
        $day = substr($r->created_at, 0, 10);
        DB::table('vibes_spend_days')->where('day', $day)->decrement('held', $r->reserved);
        DB::table('vibes_spend_days')->where('day', $day)->increment('spent', max(0, $actualMicro));
        app(Wallet::class)->record($r->user_id, 'cloud-settle:'.$r->id, 'cloud_settlement', $returned,
            ['workspaceId' => $r->workspace_id, 'chargedUnits' => (string) $charge, 'providerEstimatedMicroUsd' => $actualMicro,
                'absorbedMicroUsd' => max(0, $actualMicro - $charge), 'expiredOrRevokedUnits' => $r->reserved - $charge - $returned]);
        return $charge;
    }
}
