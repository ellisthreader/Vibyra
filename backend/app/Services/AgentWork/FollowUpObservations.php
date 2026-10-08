<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\Trigger;
use App\Models\AgentWork\FollowUp;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** Complete polling receipts, bound to the pre-read account/grant and exact trigger revision. */
final class FollowUpObservations
{
    public static function record(Trigger $trigger, ?array $authority, bool $complete, CarbonImmutable $at, ?int $windowStart): void
    {
        if (!config('agents_v2.work_enabled') || !$authority) return;
        DB::transaction(function () use ($trigger, $authority, $complete, $at, $windowStart) {
            $t = Trigger::whereKey($trigger->id)->lockForUpdate()->first();
            if (!$t || $t->paused_at || $t->deleted_at || FollowUpAuthority::snapshot($t, true) !== $authority) return;
            $hash = FollowUpAuthority::hash($authority);
            $old = DB::table('agent_work_observations')->where('trigger_id', $t->id)->first();
            $start = $windowStart ? CarbonImmutable::createFromTimestamp($windowStart) : $at;
            $continuous = $old && $old->authority_hash === $hash && $old->complete && $old->complete_since
                && ($windowStart ? $start->lte(CarbonImmutable::parse($old->observed_at)) : CarbonImmutable::parse($old->observed_at)->gte($at->subMinutes(3)));
            $since = $complete ? ($continuous ? $old->complete_since : $start) : null;
            // Do not let a slower older poll overwrite a later observation.
            if ($old && CarbonImmutable::parse($old->observed_at)->gt($at)) return;
            DB::table('agent_work_observations')->updateOrInsert(['trigger_id' => $t->id], ['user_id' => $t->user_id,
                'authority_hash' => $hash, 'complete' => $complete, 'observed_at' => $at, 'complete_since' => $since]);
        });
    }

    public static function covers(FollowUp $row): bool
    {
        $o = DB::table('agent_work_observations')->where('trigger_id', $row->trigger_id)
            ->where('authority_hash', FollowUpAuthority::hash($row->source_snapshot))->where('complete', true)->first();
        return $o && $o->complete_since && CarbonImmutable::parse($o->complete_since)->lte($row->activated_at)
            && CarbonImmutable::parse($o->observed_at)->gte($row->due_at)
            && CarbonImmutable::parse($o->observed_at)->gte(now()->subMinutes(3));
    }
}
