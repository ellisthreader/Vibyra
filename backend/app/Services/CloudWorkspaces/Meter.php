<?php
namespace App\Services\CloudWorkspaces;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class Meter
{
    /** Account wallet and workspace locks held. Never bill beyond signed authority. */
    public function settle(object $w, bool $final = false): void
    {
        $r = DB::table('cloud_reservations')->where('workspace_id', $w->id)->whereNull('settled_at')->first();
        if (!$r) return;
        $seconds = $w->metered_at && $w->lease_until
            ? max(0, min(now()->timestamp, Carbon::parse($w->lease_until)->timestamp) - Carbon::parse($w->metered_at)->timestamp) : 0;
        $numerator = (int) $w->runtime_numerator + $seconds * $w->units_per_hour;
        $provider = (int) $w->provider_numerator + $seconds * $w->provider_micro_per_hour;
        $previous = (int) DB::table('cloud_reservations')->where('workspace_id', $w->id)->whereNotNull('settled_at')->sum('charged');
        $charge = max(0, intdiv($numerator + ($final ? 3599 : 0), 3600) - $previous);
        $previousProvider = (int) DB::table('cloud_reservations')->where('workspace_id', $w->id)->whereNotNull('settled_at')->sum('actual_micro_usd');
        $cost = max(0, intdiv($provider + ($final ? 3599 : 0), 3600) - $previousProvider);
        $charged = app(Reservations::class)->settle($r, $charge, $cost);
        DB::table('cloud_reservations')->where('id', $r->id)->update(['metered_from' => $w->metered_at,
            'metered_to' => $w->metered_at ? Carbon::parse($w->metered_at)->addSeconds($seconds) : null, 'billed_seconds' => $seconds]);
        DB::table('cloud_workspaces')->where('id', $w->id)->update(['runtime_numerator' => $numerator, 'provider_numerator' => $provider,
            'runtime_charged_units' => $previous + $charged,
            'metered_at' => Carbon::createFromTimestamp(min(now()->timestamp, $w->lease_until ? Carbon::parse($w->lease_until)->timestamp : now()->timestamp)), 'updated_at' => now()]);
    }
}
