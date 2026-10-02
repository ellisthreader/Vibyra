<?php
namespace App\Services\Assistant;

use App\Models\User;
use App\Services\Membership\{Allowances, Units};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;

/** The existing cross-device wallet is the payer. Lock wallet before assistant controls. */
final class Tokens
{
    public function prepare(int $user): void
    {
        app(Wallet::class)->ensure(User::findOrFail($user));
        app(Allowances::class)->refresh($user);
    }

    public function lock(int $user): void
    {
        app(Wallet::class)->lock($user);
        app(Allowances::class)->expire($user);
    }

    public function hold(int $user, string $id, int $micro): array
    {
        $scale = Units::scale($user); $perUnit = intdiv(Units::SCALE, $scale);
        $units = (int) ceil($micro / $perUnit); $left = $units; $allocations = [];
        $grants = DB::table('vibes_grants')->where('user_id', $user)->whereNull('revoked_at')
            ->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')->orderBy('expires_at')->orderBy('id')->get();
        foreach ($grants as $grant) {
            // Legacy trial grants belong to their original chat slots. Modern free tasks retain the two-token ceiling.
            if ($grant->kind === 'trial' && ($scale === 1 || $units > 2 * $scale)) continue;
            $take = min($left, (int) $grant->remaining);
            if ($take <= 0) continue;
            DB::table('vibes_grants')->where('id', $grant->id)->decrement('remaining', $take);
            $allocations[] = ['id' => $grant->id, 'amount' => $take, 'trial' => $grant->kind === 'trial'];
            $left -= $take;
        }
        if ($left > 0) Failure::raise(402, 'assistant_tokens', 'You need more Vibyra tokens for this request. Open your token balance to continue.');
        $free = min($micro, (int) collect($allocations)->where('trial', true)->sum('amount') * $perUnit);
        $day = now()->toDateString();
        DB::table('vibes_spend_days')->insertOrIgnore(['day' => $day]);
        $budget = DB::table('vibes_spend_days')->where('day', $day)->lockForUpdate()->first();
        if ($budget->held + $budget->spent + $micro > config('vibes.daily_micro_usd_limit')
            || ($free > 0 && $budget->free_held + $budget->free_spent + $free > config('membership.free_daily_micro_limit'))) {
            Failure::raise(503, 'assistant_capacity', 'Vibyra AI is at capacity. Your tokens remain available; please try again later.');
        }
        DB::table('vibes_spend_days')->where('day', $day)->incrementEach(['held' => $micro, 'free_held' => $free]);
        app(Wallet::class)->record($user, 'assistant-hold:'.$id, 'assistant_hold', -$units);
        return ['reserved_units' => $units, 'unit_scale' => $scale, 'allocations' => json_encode($allocations), 'free_micro_usd' => $free];
    }

    public function settle(object $row, ?int $actual): int
    {
        $perUnit = intdiv(Units::SCALE, $row->unit_scale);
        // Unknown usage is absorbed by Vibyra, while its full operator reservation remains spent.
        $charge = min($row->reserved_units, (int) ceil(max(0, $actual ?? 0) / $perUnit));
        $left = $charge; $returned = 0;
        foreach (json_decode($row->allocations, true) as $a) {
            $used = min($left, $a['amount']); $left -= $used;
            $release = $a['amount'] - $used;
            if ($row->user_id && DB::table('vibes_grants')->where('id', $a['id'])->where('user_id', $row->user_id)
                ->whereNull('revoked_at')->increment('remaining', $release)) $returned += $release;
        }
        $risk = max(0, $actual ?? $row->reserved_micro_usd);
        $day = DB::table('vibes_spend_days')->where('day', substr($row->created_at, 0, 10));
        $day->incrementEach(['held' => -$row->reserved_micro_usd, 'spent' => $risk,
            'free_held' => -$row->free_micro_usd,
            'free_spent' => (int) ceil($risk * $row->free_micro_usd / max(1, $row->reserved_micro_usd))]);
        if ($row->user_id) app(Wallet::class)->record($row->user_id, 'assistant-settle:'.$row->id, 'assistant_settlement', $returned,
            ['service' => $row->kind, 'chargedUnits' => (string) $charge, 'actualMicroUsd' => $actual,
                'unconfirmedMicroUsd' => $actual === null ? $risk : 0,
                'expiredOrRevokedUnits' => $row->reserved_units - $charge - $returned]);
        return $charge;
    }
}
