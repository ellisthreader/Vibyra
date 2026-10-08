<?php
namespace App\Services\AgentWork;

use App\Models\AgentV2\Run;
use App\Models\AgentWork\Goal;
use App\Services\AgentRuns\RunStates;
use App\Services\AgentSchedules\SystemAdmission;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/** Sequential database-only orchestration. Model output supplies evidence, never activation. */
final class GoalProgress
{
    public function tick(): int
    {
        if (!config('agents_v2.work_enabled')) return 0;
        $ids = Goal::whereNotIn('status', ['completed', 'cancelled', 'expired'])->orderByRaw('checked_at IS NOT NULL')->orderBy('checked_at')->orderBy('id')->limit(200)->pluck('id');
        foreach ($ids as $id) {
            try { $this->advance($id); } catch (\Throwable $e) { report($e); }
            Goal::whereKey($id)->update(['checked_at' => now()]);
        }
        return $ids->count();
    }

    public function advance(string $id): void
    {
        if (!config('agents_v2.work_enabled')) return;
        DB::transaction(function () use ($id) {
            $goal = Goal::whereKey($id)->lockForUpdate()->first();
            if (!$goal || in_array($goal->status, ['completed', 'cancelled', 'expired'], true)) return;
            RuntimePins::lock((int) $goal->user_id, $goal->runtime_binding_id);
            if (!$goal->expires_at->isFuture()) {
                app(Goals::class)->cancelTasks($goal); $this->save($goal, $goal->milestones, 'expired', 'deadline_reached'); return;
            }
            if ($goal->status === 'blocked') return;
            $steps = $goal->milestones;
            foreach ($steps as $i => $step) {
                if (!$step['runId']) continue;
                $run = Run::whereKey($step['runId'])->where('user_id', $goal->user_id)->where('agent_id', $goal->agent_id)->lockForUpdate()->first();
                if (!$run || !RuntimePins::same($goal->runtime_snapshot, $run->runtime_snapshot)) {
                    $steps[$i]['status'] = 'blocked'; $this->save($goal, $steps, 'blocked', 'milestone_evidence_missing'); return;
                }
                if ($run->state === 'completed' && Evidence::from($run, (int) $goal->user_id, $goal->agent_id)) $steps[$i]['status'] = 'delivered';
                elseif (RunStates::terminal($run->state)) {
                    $steps[$i]['status'] = 'blocked'; $this->save($goal, $steps, 'blocked', 'milestone_'.$run->state); return;
                } else { $this->save($goal, $steps, $goal->status, null); return; }
            }
            if ($goal->status === 'paused') { $this->save($goal, $steps, 'paused', null); return; }
            $next = null;
            foreach ($steps as $i => $step) if ($step['status'] === 'pending') { $next = $i; break; }
            if ($next === null) { $this->save($goal, $steps, 'awaiting_review', null); return; }
            try { RuntimePins::require((int) $goal->user_id, $goal->runtime_snapshot); }
            catch (HttpResponseException $e) { $this->save($goal, $steps, 'blocked', $e->getResponse()->getData(true)['code'] ?? 'runtime_unavailable'); return; }
            $step = $steps[$next];
            $delivered = array_column(array_filter($steps, fn ($s) => $s['status'] === 'delivered'), 'key');
            if (array_diff($step['dependsOn'], $delivered)) { $this->save($goal, $steps, 'blocked', 'dependency_unfinished'); return; }
            $prompt = $step['prompt']."\n\nReviewed goal: ".$goal->title."\nMilestone: ".$step['title']."\nSuccess criteria: ".$step['successCriteria'].PriorEvidence::forGoal($goal, $steps);
            $result = app(SystemAdmission::class)->admit($goal->user_id, $goal->agent_id, 'goal:'.$goal->id.':'.$step['key'], $prompt, $goal->runtime_binding_id);
            if (!$result['run']) { $this->save($goal, $steps, 'blocked', $result['code']); return; }
            RuntimePins::saveRun($result['run'], $goal->runtime_snapshot, 'goal', $goal->id, $goal->expires_at);
            $steps[$next]['runId'] = $result['run']->id; $steps[$next]['status'] = 'running';
            $this->save($goal, $steps, 'active', null);
        });
    }

    private function save(Goal $goal, array $steps, string $status, ?string $reason): void
    {
        $goal->forceFill(['milestones' => $steps, 'status' => $status, 'reason' => $reason]);
        if ($goal->isDirty()) $goal->forceFill(['revision' => $goal->revision + 1])->save();
    }
}
