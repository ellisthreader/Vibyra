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
        if ($workspace->compute_profile ?? null) DB::table('cloud_workspace_control')->where('id',1)->lockForUpdate()->firstOrFail();
        // Provider cost is the same either way, so the spend ceilings keep the full runway; only the token hold shrinks.
        if ($workspace->compute_profile ?? null) {
            $current = app(\App\Services\CloudComputer\ComputeProfiles::class)->profile($workspace->compute_profile);
            $snapshot = app(\App\Services\CloudComputer\ComputeProfiles::class)->snapshot($workspace);
            abort_if($snapshot['native'] && !config('cloud_preview.native_enabled'), 503, 'Native Cloud Preview is paused. Stop and approve a fresh quote.');
            abort_unless($current['tariffVersion'] === $workspace->tariff_version && $current['unitsPerHour'] === (int) $workspace->units_per_hour
                && $current['providerMicroPerHour'] === (int) $workspace->provider_micro_per_hour, 503, 'Cloud pricing changed. Stop and approve a fresh quote.');
            // Near a session cap, hold only the remaining budget. Lease issuance
            // below is clipped to the execution time that this hold can fund.
            $amount = min($amount, max(0, (int) $workspace->budget_units - app(Budgets::class)->committed($workspace)));
            abort_unless($amount > 0, 402, 'Cloud session token limit reached.');
        }
        $spendHeld = ($workspace->compute_profile ?? null)
            ? intdiv($amount * (int) $workspace->provider_micro_per_hour + (int) $workspace->units_per_hour - 1, (int) $workspace->units_per_hour)
            : $amount;
        $amount = app(Allowance::class)->uncoveredUnits($workspace, $amount);
        abort_if(DB::table('cloud_reservations')->where('workspace_id', $workspace->id)->whereNull('settled_at')->exists(), 409, 'Settle the previous runtime reservation first.');
        app(Allowances::class)->expire($workspace->user_id);
        app(Budgets::class)->guard($workspace, $amount);
        $left = $amount; $allocations = [];
        $grants = DB::table('vibes_grants')->where('user_id', $workspace->user_id)->whereNull('revoked_at')
            ->where('kind', '!=', 'trial')->orderBy('id')->get();
        foreach ($amount > 0 ? $grants : [] as $g) {
            $take = min($left, (int) $g->remaining);
            if ($take <= 0) continue;
            DB::table('vibes_grants')->where('id', $g->id)->decrement('remaining', $take);
            $allocations[] = ['id' => $g->id, 'amount' => $take];
            $left -= $take;
        }
        abort_if($left > 0, 402, 'More paid tokens are needed to keep this computer running.');
        $id = (string) Str::uuid();
        DB::table('cloud_reservations')->insert(['id' => $id, 'user_id' => $workspace->user_id, 'workspace_id' => $workspace->id,
            'compute_profile' => $workspace->compute_profile ?? null, 'preview_trial' => $workspace->compute_trial ?? false,
            'generation' => $workspace->generation, 'reserved' => $amount, 'tariff_version' => $workspace->tariff_version,
            'units_per_hour' => $workspace->units_per_hour, 'provider_micro_per_hour' => $workspace->provider_micro_per_hour,
            'allocations' => json_encode($allocations), 'spend_held' => $spendHeld, 'created_at' => now(), 'updated_at' => now()]);
        $day = now()->toDateString();
        DB::table('vibes_spend_days')->insertOrIgnore(['day' => $day]);
        $d = DB::table('vibes_spend_days')->where('day', $day)->lockForUpdate()->first();
        abort_if($d->held + $d->spent + $spendHeld > config('cloud_workspaces.daily_micro_limit'), 503, 'Hosted computing is at capacity.');
        app(\App\Services\CloudComputer\PreviewCosts::class)->guard($workspace, $spendHeld);
        app(SpendGuard::class)->holdMonth($spendHeld);
        DB::table('vibes_spend_days')->where('day', $day)->increment('held', $spendHeld);
        if ($amount > 0) app(Wallet::class)->record($workspace->user_id, 'cloud-hold:'.$id, 'cloud_hold', -$amount, ['workspaceId' => $workspace->id, 'spendHeld' => $spendHeld]);
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
        DB::table('vibes_spend_days')->where('day', $day)->decrement('held', $r->spend_held ?? $r->reserved);
        DB::table('vibes_spend_days')->where('day', $day)->increment('spent', max(0, $actualMicro));
        app(Wallet::class)->record($r->user_id, 'cloud-settle:'.$r->id, 'cloud_settlement', $returned,
            ['workspaceId' => $r->workspace_id, 'chargedUnits' => (string) $charge, 'providerEstimatedMicroUsd' => $actualMicro,
                'absorbedMicroUsd' => max(0, $actualMicro - (($r->compute_profile ?? null) ? intdiv($charge * (int) $r->provider_micro_per_hour, (int) $r->units_per_hour) : $charge)), 'expiredOrRevokedUnits' => $r->reserved - $charge - $returned]);
        return $charge;
    }
}
