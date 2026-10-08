<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Run, Trigger};
use App\Models\AgentWork\FollowUp;
use App\Services\AgentWork\{FollowUps, FollowUpProgress};
use Illuminate\Support\Facades\DB;

final class AgentStageFourFollowUpsTest extends AgentWorkTestCase
{
    public function test_time_condition_never_admits_early_and_duplicate_ticks_admit_once(): void
    {
        $at = now()->addMinutes(2); $f = $this->follow(['kind' => 'time', 'at' => $at->toIso8601String()]);
        app(FollowUpProgress::class)->tick(); $this->assertDatabaseCount('agent_runs', 0);
        $this->travelTo($at); app(FollowUpProgress::class)->tick(); app(FollowUpProgress::class)->tick();
        $this->assertDatabaseCount('agent_runs', 1); $this->assertSame('admitted', FollowUp::find($f['id'])->status);
        $this->completeNext(); app(FollowUpProgress::class)->tick();
        $this->getJson('/api/agents/v2/followups/'.$f['id'])->assertOk()->assertJsonPath('followup.status', 'completed');
    }

    public function test_only_new_authenticated_exact_subject_event_causes_one_followup(): void
    {
        $t = $this->githubTrigger(); $this->issueEvent($t)->assertStatus(202);
        $f = $this->follow(['kind' => 'event', 'triggerId' => $t['id'], 'triggerRevision' => $t['revision'], 'subject' => 'github:acme/app#7']);
        app(FollowUpProgress::class)->tick(); $this->assertNull(FollowUp::find($f['id'])->run_id);
        $this->issueEvent($t, 'Invalid signature', 7, false)->assertStatus(401);
        $this->issueEvent($t, 'Another issue', 8)->assertStatus(202); app(FollowUpProgress::class)->tick();
        $this->assertNull(FollowUp::find($f['id'])->run_id);
        $this->issueEvent($t, 'Real follow-up')->assertStatus(202); $this->issueEvent($t, 'Real follow-up')->assertStatus(202);
        app(FollowUpProgress::class)->tick(); app(FollowUpProgress::class)->tick();
        $this->assertNotNull(FollowUp::find($f['id'])->event_id);
        $this->assertSame(1, Run::where('idempotency_key', 'followup:'.$f['id'])->count());
        $this->assertSame(3, DB::table('agent_work_signals')->count());
    }

    public function test_matching_reply_satisfies_absence_condition_without_sending_a_reminder(): void
    {
        $t = $this->githubTrigger(); $this->issueEvent($t)->assertStatus(202);
        $f = $this->follow(['kind' => 'absence', 'at' => now()->addHour()->toIso8601String(),
            'triggerId' => $t['id'], 'triggerRevision' => $t['revision'], 'subject' => 'github:acme/app#7']);
        $this->issueEvent($t, 'Reply received')->assertStatus(202); app(FollowUpProgress::class)->tick();
        $this->travel(2)->hours(); app(FollowUpProgress::class)->tick();
        $this->assertSame('satisfied', FollowUp::find($f['id'])->status);
        $this->assertSame(0, Run::where('idempotency_key', 'followup:'.$f['id'])->count());
    }

    public function test_absence_uses_the_reviewed_deadline_even_when_scanner_runs_late(): void
    {
        foreach ([-1, 0, 1] as $offset) {
            $t = $this->githubTrigger(); $this->issueEvent($t)->assertStatus(202); $due = now()->addMinutes(2)->startOfSecond();
            $f = app(FollowUps::class)->activate($this->user->id, [...$this->workSpec(), 'prompt' => 'Check the reviewed deadline.',
                'condition' => ['kind' => 'absence', 'at' => $due->toIso8601String(), 'triggerId' => $t['id'],
                    'triggerRevision' => $t['revision'], 'subject' => 'github:acme/app#7']], 'deadline-'.$offset);
            $this->travelTo($due->copy()->addSeconds($offset)); $this->issueEvent($t, 'Reply relative to deadline '.$offset)->assertStatus(202);
            $this->travelTo($due->copy()->addMinute()); app(FollowUpProgress::class)->advance($f['id']);
            $saved = FollowUp::findOrFail($f['id']);
            $this->assertSame($offset <= 0 ? 'satisfied' : 'admitted', $saved->status);
            $this->assertSame($offset > 0, $saved->run_id !== null);
        }
    }

    public function test_absence_never_fires_on_changed_or_unhealthy_source(): void
    {
        $t = $this->githubTrigger(); $this->issueEvent($t)->assertStatus(202);
        $f = $this->follow(['kind' => 'absence', 'at' => now()->addMinute()->toIso8601String(),
            'triggerId' => $t['id'], 'triggerRevision' => $t['revision'], 'subject' => 'github:acme/app#7']);
        Trigger::whereKey($t['id'])->update(['revision' => 2]); $this->travel(2)->minutes(); app(FollowUpProgress::class)->tick();
        $this->assertSame('blocked', FollowUp::find($f['id'])->status); $this->assertNull(FollowUp::find($f['id'])->run_id);
    }

    public function test_pause_cas_cancel_expiry_and_replay_keep_one_target(): void
    {
        $spec = [...$this->workSpec(), 'prompt' => 'One followup', 'condition' => ['kind' => 'time', 'at' => now()->addMinute()->toIso8601String()]];
        $f = app(FollowUps::class)->activate($this->user->id, $spec, 'replay');
        $this->postJson('/api/agents/v2/followups/'.$f['id'].'/control', ['revision' => 1, 'action' => 'pause'])->assertOk();
        $this->postJson('/api/agents/v2/followups/'.$f['id'].'/control', ['revision' => 1, 'action' => 'cancel'])->assertStatus(409);
        $this->travel(3)->days(); app(FollowUpProgress::class)->tick();
        $same = app(FollowUps::class)->activate($this->user->id, $spec, 'replay');
        $this->assertSame($f['id'], $same['id']); $this->assertSame('expired', $same['status']);
        $this->assertDatabaseCount('agent_runs', 0); $this->assertDatabaseCount('agent_work_followups', 1);
    }
}
