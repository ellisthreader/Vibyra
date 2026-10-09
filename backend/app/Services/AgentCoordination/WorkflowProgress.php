<?php
namespace App\Services\AgentCoordination;
use App\Models\AgentCoordination\{Message, Workflow};
use App\Models\AgentV2\Run;
use App\Services\AgentRuns\{Admission, RunStates, Runs};
use App\Services\AgentWork\RuntimePins;
use Illuminate\Support\Facades\DB;
final class WorkflowProgress
{
    private const DONE = ['completed', 'cancelled', 'expired'];
    public function tick(): void
    {
        if (!config('agents_v2.coordination_enabled')) return;
        $ids = Workflow::whereNotIn('status', self::DONE)->orderByRaw('checked_at IS NOT NULL')->orderBy('checked_at')->orderBy('id')->limit(200)->pluck('id');
        foreach ($ids as $id) {
            try { $this->advance($id); } catch (\Throwable $e) { report($e); }
            finally { Workflow::whereKey($id)->update(['checked_at' => now()]); }
        }
    }
    public static function authority(Workflow $w): void
    {
        Gate::require($w->user_id); $g = app(Groups::class)->find($w->user_id, $w->group_id, true);
        abort_if($g->deleted_at || $g->revision !== $w->group_revision, 409, 'Reviewed group membership changed.');
        abort_unless($w->expires_at->isFuture(), 409, 'This workflow expired.');
        RuntimePins::require($w->user_id, $w->runtime_snapshot); MemberPins::require($w->user_id, $w->member_snapshots);
    }
    public function advance(string $id): void
    {
        try { $this->advanceTransaction($id); }
        catch (\Illuminate\Http\Exceptions\HttpResponseException $e) {
            $data = json_decode($e->getResponse()->getContent(), true);
            $this->admissionRefused($id, ($data['code'] ?? null) === 'job_queue_full');
        }
    }
    private function admissionRefused(string $id, bool $capacity): void
    {
        $initial = Workflow::find($id); if (!$initial) return;
        DB::transaction(function () use ($initial, $capacity) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($initial->user_id);
            app(Groups::class)->find($initial->user_id, $initial->group_id, true);
            $w = Workflow::whereKey($initial->id)->lockForUpdate()->firstOrFail();
            if (!in_array($w->status, ['active', 'synthesizing'])) return;
            if ($capacity) {
                if ($w->reason !== 'job_queue_full') $w->forceFill(['reason' => 'job_queue_full', 'revision' => $w->revision + 1])->save();
            } else { self::cancelRuns($w); $this->state($w, 'blocked', 'admission_refused'); }
        });
    }
    private function advanceTransaction(string $id): void
    {
        $initial = Workflow::find($id); if (!$initial || in_array($initial->status, self::DONE)) return;
        DB::transaction(function () use ($initial) {
            \App\Services\AgentRuns\Jobs\AccountLock::lock($initial->user_id);
            app(Groups::class)->find($initial->user_id, $initial->group_id, true);
            $w = Workflow::whereKey($initial->id)->lockForUpdate()->firstOrFail();
            if (in_array($w->status, self::DONE)) return;
            if ($w->expires_at->isPast()) { self::cancelRuns($w); $this->state($w, 'expired', 'workflow_expired'); return; }
            if ($w->status === 'blocked') return;
            try { self::authority($w); }
            catch (\Illuminate\Http\Exceptions\HttpResponseException|\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                self::cancelRuns($w); $this->state($w, 'blocked', 'reviewed_authority_changed'); return;
            }
            $steps = $w->steps; $changed = false;
            if ($w->reason === 'job_queue_full') { $w->reason = null; $changed = true; }
            foreach ($steps as &$s) {
                if (!$s['runId']) continue;
                $r = Run::where('user_id', $w->user_id)->whereKey($s['runId'])->first();
                if ($evidence = WorkflowEvidence::for($w, $s['runId'], $s['agentId'])) {
                    if ($s['status'] !== 'delivered') { $s['status'] = 'delivered'; $s['evidence'] = $evidence; $changed = true; }
                } elseif (!$r || RunStates::terminal($r->state)) {
                    $s['status'] = 'blocked'; $s['reason'] = 'task_did_not_deliver'; $w->steps = $steps; $w->save();
                    self::cancelRuns($w); $this->state($w, 'blocked', 'task_did_not_deliver'); return;
                }
            }
            unset($s); $w->steps = $steps;
            if ($changed) { $w->revision++; $w->save(); }
            if (in_array($w->status, ['paused', 'awaiting_review'])) return;
            if ($w->final_run_id) {
                $r = Run::where('user_id', $w->user_id)->whereKey($w->final_run_id)->first();
                if (WorkflowEvidence::for($w, $w->final_run_id, $w->coordinator_id)) $this->state($w, 'awaiting_review');
                elseif (!$r || RunStates::terminal($r->state)) { self::cancelRuns($w); $this->state($w, 'blocked', 'final_task_did_not_deliver'); }
                return;
            }
            $delivered = array_column(array_filter($steps, fn ($s) => $s['status'] === 'delivered'), 'key');
            if (count($delivered) === count($steps)) {
                $run = $this->admit($w, $w->coordinator_id, WorkflowPrompts::final($w), 'final', 'synthesis');
                $w->final_run_id = $run->id; $this->state($w, 'synthesizing'); return;
            }
            foreach ($steps as &$s) if ($s['status'] === 'pending' && !array_diff($s['dependsOn'], $delivered)) {
                $run = $this->admit($w, $s['agentId'], WorkflowPrompts::step($w, $s), $s['key'], 'worker');
                $s['runId'] = $run->id; $s['status'] = 'running'; $changed = true;
            }
            unset($s);
            if ($changed) $w->forceFill(['steps' => $steps, 'revision' => $w->revision + 1])->save();
        });
    }
    private function admit(Workflow $w, string $agentId, string $prompt, string $key, string $role): Run
    {
        [$run] = app(Admission::class)->admit($w->user_id, ['agentId' => $agentId, 'runtimeId' => $w->runtime_binding_id,
            'prompt' => $prompt, 'attachments' => [], 'idempotencyKey' => 'workflow:'.$w->id.':'.$role.':'.$key, 'executionMode' => 'coordinated']);
        Context::attach($run, Message::findOrFail($w->message_id), $w, $role, $role === 'worker' ? $key : null); return $run;
    }
    public static function cancelRuns(Workflow $w): void
    {
        $ids = array_filter([...array_column($w->steps, 'runId'), $w->final_run_id]); sort($ids);
        foreach ($ids as $id) if (Run::where('user_id', $w->user_id)->whereKey($id)->exists()) app(Runs::class)->cancel($w->user_id, $id);
    }
    private function state(Workflow $w, string $state, ?string $reason = null): void
    {
        $w->forceFill(['status' => $state, 'reason' => $reason, 'revision' => $w->revision + 1])->save();
    }
}
