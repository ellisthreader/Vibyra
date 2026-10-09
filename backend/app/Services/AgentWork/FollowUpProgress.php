<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\{Run, Trigger};
use App\Models\AgentWork\FollowUp;
use App\Services\AgentRuns\RunStates;
use App\Services\AgentSchedules\SystemAdmission;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

final class FollowUpProgress
{
    public function tick(): int
    {
        if (!config('agents_v2.work_enabled')) return 0;
        $ids = FollowUp::whereIn('status', ['active', 'paused', 'blocked', 'admitted'])->orderByRaw('checked_at IS NOT NULL')->orderBy('checked_at')->orderBy('id')->limit(200)->pluck('id');
        foreach ($ids as $id) {
            try { $this->advance($id); } catch (\Throwable $e) { report($e); }
            FollowUp::whereKey($id)->update(['checked_at' => now()]);
        }
        return $ids->count();
    }

    public function advance(string $id): void
    {
        if (!config('agents_v2.work_enabled')) return;
        $peek = FollowUp::find($id);
        if (!$peek) return;
        DB::transaction(function () use ($peek) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock((int) $peek->user_id);
            // Intake and scanners use trigger → connection → grant → follow-up → binding → run.
            $trigger = $peek->trigger_id ? Trigger::whereKey($peek->trigger_id)->lockForUpdate()->first() : null;
            $authority = $trigger ? FollowUpAuthority::snapshot($trigger, true) : null;
            $row = FollowUp::whereKey($peek->id)->lockForUpdate()->first();
            if (!$row || in_array($row->status, ['completed', 'cancelled', 'expired', 'satisfied'], true)) return;
            RuntimePins::lock((int) $row->user_id, $row->runtime_binding_id);
            if (!$row->expires_at->isFuture()) {
                app(FollowUps::class)->cancelTask($row); $this->mark($row, 'expired', 'deadline_reached'); return;
            }
            if ($row->run_id) {
                $run = Run::whereKey($row->run_id)->where('user_id', $row->user_id)->where('agent_id', $row->agent_id)->lockForUpdate()->first();
                if (!$run || !RuntimePins::same($row->runtime_snapshot, $run->runtime_snapshot)) { $this->mark($row, 'blocked', 'task_evidence_missing'); return; }
                if (Evidence::from($run, (int) $row->user_id, $row->agent_id)) $this->mark($row, 'completed');
                elseif (RunStates::terminal($run->state)) $this->mark($row, 'blocked', 'task_'.$run->state);
                return;
            }
            if (in_array($row->status, ['paused', 'blocked'], true)) return;
            $condition = $row->condition;
            if ($condition['kind'] !== 'time') {
                if (!$trigger || (int) $trigger->user_id !== (int) $row->user_id || $trigger->agent_id !== $row->agent_id
                    || $trigger->revision !== $row->trigger_revision) { $this->mark($row, 'blocked', 'followup_source_changed'); return; }
                if (!$authority || $authority !== $row->source_snapshot) { $this->mark($row, 'blocked', 'followup_source_changed'); return; }
                if ($reason = app(FollowUpSources::class)->refusal($trigger)) { $this->mark($row, 'blocked', $reason); return; }
                $signal = DB::table('agent_work_signals')->where('trigger_id', $trigger->id)->where('user_id', $row->user_id)
                    ->where('trigger_revision', $row->trigger_revision)->where('authority_hash', FollowUpAuthority::hash($authority))->where('subject', $condition['subject'])
                    ->where('id', '>', $row->signal_cursor)
                    ->when($condition['kind'] === 'absence', fn ($q) => $q->where('created_at', '<=', $row->due_at))
                    ->orderBy('id')->first();
                if ($signal) {
                    $row->event_id = $signal->event_id;
                    if ($condition['kind'] === 'absence') { $this->mark($row, 'satisfied', 'matching_event_received'); return; }
                } elseif ($condition['kind'] === 'event') return;
            }
            if ($row->due_at && $row->due_at->isFuture()) return;
            if ($condition['kind'] === 'absence' && in_array($trigger->kind, ['gmail.message', 'calendar.event_soon'], true)
                && !FollowUpObservations::covers($row)) {
                // Keep waiting for a complete fresh observation; expiry remains authoritative.
                $this->mark($row, 'active', 'waiting_for_fresh_source'); return;
            }
            try { RuntimePins::require((int) $row->user_id, $row->runtime_snapshot); }
            catch (HttpResponseException $e) { $this->mark($row, 'blocked', $e->getResponse()->getData(true)['code'] ?? 'runtime_unavailable'); return; }
            $result = app(SystemAdmission::class)->admit($row->user_id, $row->agent_id, 'followup:'.$row->id, $row->prompt, $row->runtime_binding_id);
            if (!$result['run']) { $this->mark($row, 'blocked', $result['code']); return; }
            RuntimePins::saveRun($result['run'], $row->runtime_snapshot, 'followup', $row->id, $row->expires_at);
            $row->run_id = $result['run']->id; $this->mark($row, 'admitted');
        });
    }

    private function mark(FollowUp $row, string $state, ?string $reason = null): void
    {
        $row->forceFill(['status' => $state, 'reason' => $reason]);
        if ($row->isDirty()) $row->forceFill(['revision' => $row->revision + 1])->save();
    }
}
