<?php

namespace App\Services\AgentSchedules;

use App\Models\AgentV2\Occurrence;
use App\Models\AgentV2\Run;
use App\Models\AgentV2\Schedule;
use App\Services\AgentRuns\Lifecycle;
use App\Services\AgentRuns\RunStates;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/**
 * One scheduler tick (every minute, one server). A due schedule is claimed with a
 * compare-and-set on its `next_run_at`, and its occurrence row is unique per
 * (schedule, revision, intended time), so duplicate workers admit at most one run.
 *
 * Missed time is never replayed as a burst: only the latest due occurrence is kept
 * (one catch-up), and only inside the schedule's catch-up window. An occurrence whose
 * run is still waiting for an offline Mac past that window expires with a reason.
 */
final class Scheduler
{
    public function __construct(private readonly SystemAdmission $admission, private readonly Lifecycle $lifecycle) {}

    /** @return array{claimed: int, admitted: int, expired: int} */
    public function tick(): array
    {
        $now = CarbonImmutable::now();
        $stats = ['claimed' => 0, 'admitted' => 0, 'expired' => 0];
        Occurrence::query()->where('state', 'pending')->orderBy('intended_at')->limit(200)->get()
            ->each(function (Occurrence $o) use (&$stats) { if (in_array($this->admit($o), ['admitted', 'waiting'], true)) $stats['admitted']++; });
        Occurrence::query()->where('state', 'waiting')->orderBy('intended_at')->limit(500)->get()
            ->each(function (Occurrence $o) use ($now, &$stats) { if ($this->refreshWaiting($o, $now)) $stats['expired']++; });
        Schedule::query()->whereNull('paused_at')->whereNull('deleted_at')->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', $now)->orderBy('next_run_at')->limit(500)->get()
            ->each(function (Schedule $s) use ($now, &$stats) {
                $o = $this->claim($s, $now);
                if (!$o) return;
                $stats['claimed']++;
                if ($o->state === 'pending' && in_array($this->admit($o), ['admitted', 'waiting'], true)) $stats['admitted']++;
            });
        return $stats;
    }

    /** Atomically take a due schedule's occurrence. Null when another worker already did. */
    public function claim(Schedule $s, CarbonImmutable $now): ?Occurrence
    {
        $due = CarbonImmutable::parse($s->next_run_at);
        $intended = Recurrence::latestDue($s->recurrence, $s->timezone, $due, $now);
        $next = Recurrence::next($s->recurrence, $s->timezone, $now);
        $won = Schedule::query()->whereKey($s->id)->where('revision', $s->revision)->whereNull('paused_at')
            ->whereNull('deleted_at')->where('next_run_at', $s->next_run_at)
            ->update(['next_run_at' => $next, 'updated_at' => now()]);
        if ($won !== 1) return null;
        [$state, $reason] = ['pending', null];
        if ($now->greaterThan($intended->addMinutes($s->catch_up_minutes))) [$state, $reason] = ['expired', 'missed_window'];
        elseif ($s->overlap !== 'queue' && $this->previousActive($s)) [$state, $reason] = ['skipped', 'previous_run_active'];
        try {
            return Occurrence::query()->create(['schedule_id' => $s->id, 'user_id' => $s->user_id, 'revision' => $s->revision,
                'intended_at' => $intended, 'state' => $state, 'reason' => $reason]);
        } catch (QueryException) {
            return null; // The unique occurrence already exists: someone else owns it.
        }
    }

    /** Admit (or re-find) the occurrence's run with its deterministic key. Returns the new state. */
    public function admit(Occurrence $o): string
    {
        $s = Schedule::query()->whereKey($o->schedule_id)->first();
        $stop = match (true) {
            !$s || $s->deleted_at !== null => 'schedule_deleted',
            $s->paused_at !== null => 'schedule_paused',
            $s->revision !== $o->revision => 'schedule_edited',
            now()->greaterThan(CarbonImmutable::parse($o->intended_at)->addMinutes($s->catch_up_minutes)) => 'missed_window',
            default => null,
        };
        if ($stop) return $this->mark($o, $stop === 'missed_window' ? 'expired' : 'skipped', $stop);
        $key = 'sched:'.$s->id.':'.$o->revision.':'.CarbonImmutable::parse($o->intended_at)->getTimestamp();
        $result = $this->admission->admit($s->user_id, $s->agent_id, $key, $s->prompt, $s->runtime_binding_id);
        if (!$result['run']) return $this->mark($o, 'failed', $result['code']);
        $o->forceFill(['run_id' => $result['run']->id])->save();
        return $this->mark($o, $result['run']->state === RunStates::WAITING_COMPUTER ? 'waiting' : 'admitted', null);
    }

    /** True when the waiting occurrence expired (its run is failed with a reason, never left hanging). */
    private function refreshWaiting(Occurrence $o, CarbonImmutable $now): bool
    {
        $s = Schedule::query()->whereKey($o->schedule_id)->first();
        $window = $s?->catch_up_minutes ?? (int) config('agents_v2.schedule_catch_up_minutes', 60);
        return DB::transaction(function () use ($o, $now, $window) {
            $run = Run::query()->whereKey($o->run_id)->lockForUpdate()->first();
            if (!$run || $run->state !== RunStates::WAITING_COMPUTER) {
                $this->mark($o, 'admitted', null);
                return false;
            }
            if (!$now->greaterThan(CarbonImmutable::parse($o->intended_at)->addMinutes($window))) return false;
            $this->lifecycle->move($run, RunStates::FAILED, 'occurrence_expired', ['code' => 'computer_offline']);
            $this->mark($o, 'expired', 'computer_offline');
            return true;
        });
    }

    private function previousActive(Schedule $s): bool
    {
        $runIds = Occurrence::query()->where('schedule_id', $s->id)->whereNotNull('run_id')
            ->orderByDesc('intended_at')->limit(5)->pluck('run_id');
        return $runIds->isNotEmpty() && Run::query()->whereIn('id', $runIds)->whereNotIn('state', RunStates::TERMINAL)->exists()
            || Occurrence::query()->where('schedule_id', $s->id)->where('state', 'pending')->exists();
    }

    private function mark(Occurrence $o, string $state, ?string $reason): string
    {
        $o->forceFill(['state' => $state, 'reason' => $reason])->save();
        return $state;
    }
}
