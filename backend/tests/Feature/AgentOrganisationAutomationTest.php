<?php
namespace Tests\Feature;
use App\Models\{OrganizationMember, AgentV2\Run, AgentCoordination\Workflow};
use App\Services\AgentOrganizations\{Definitions, Instances, Maintenance};
use App\Services\AgentCoordination\{Groups, Planning, Workflows, WorkflowDraft, WorkflowProgress};
use App\Services\AgentSchedules\{Schedules, Scheduler};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Support\{AgentOrganisationFixture, AgentCoordinationFixture};
use Tests\TestCase;
final class AgentOrganisationAutomationTest extends TestCase
{
    use RefreshDatabase, AgentOrganisationFixture, AgentCoordinationFixture;
    protected function setUp(): void
    {
        parent::setUp(); $this->bootOrganisation();
        $this->user->forceFill(['plan' => 'pro', 'membership_ends_at' => now()->addDay()])->save();
        config(['agents_v2.work_enabled' => true]);
    }
    public function test_routine_admission_keeps_org_authority_and_offboarding_blocks_next_occurrence(): void
    {
        $s = app(Schedules::class)->create($this->user->id, ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'],
            'title' => 'Daily research', 'prompt' => 'Run shared process', 'timezone' => 'UTC', 'recurrence' => ['type' => 'daily', 'time' => '09:00']]);
        $s->forceFill(['next_run_at' => now()->subMinute()])->save();
        $this->assertSame(1, app(Scheduler::class)->tick()['admitted']);
        $first = Run::where('agent_id', $this->agent['id'])->firstOrFail();
        $this->assertDatabaseHas('agent_organisation_runs', ['run_id' => $first->id, 'member_id' => OrganizationMember::where('user_id', $this->user->id)->value('id')]);
        OrganizationMember::where('user_id', $this->user->id)->delete(); Maintenance::stopRevoked();
        $this->travel(2)->minutes(); $s->forceFill(['next_run_at' => now()->subMinute()])->save();
        $this->assertSame(0, app(Scheduler::class)->tick()['admitted']);
        $this->assertSame(1, Run::where('agent_id', $this->agent['id'])->count());
        $this->assertDatabaseHas('agent_schedule_occurrences', ['schedule_id' => $s->id, 'reason' => 'organisation_membership_changed']);
    }
    public function test_group_planning_workers_and_delegated_steps_all_keep_org_authority(): void
    {
        $this->coordinationRuntime();
        $definition = Definitions::save($this->user->id, (string) Str::uuid(), ['expectedRevision' => 0, 'name' => 'Second role',
            'avatar' => 'assistant', 'instructions' => 'Review published work', 'knowledge' => 'Public organisational knowledge']);
        $second = Instances::adopt($this->user->id, $definition['id'], 1, $definition['reviewHash'])['agentId'];
        $group = app(Groups::class)->save($this->user->id, (string) Str::uuid(), ['expectedRevision' => 0, 'name' => 'Shared roles',
            'coordinatorId' => $this->agent['id'], 'members' => [['agentId' => $this->agent['id'], 'handle' => 'lead'], ['agentId' => $second, 'handle' => 'review']]]);
        $message = app(Planning::class)->send($this->user->id, $group['id'], ['expectedRevision' => 1, 'runtimeId' => $this->runtime['id'],
            'expectedRuntimeRevision' => $this->runtime['revision'], 'idempotencyKey' => 'org-group-plan', 'prompt' => 'Review release',
            'mentions' => [], 'sharedContext' => ['text' => 'Explicit shared context', 'outputs' => []]]);
        $plan = Run::findOrFail($message['run']['id']);
        $spec = [...WorkflowDraft::bind($plan, ['title' => 'Review', 'expiresAt' => now()->addDay()->toIso8601String(),
            'steps' => [['key' => 'review', 'agentId' => $second, 'title' => 'Review', 'prompt' => 'Review the draft',
                'successCriteria' => 'A useful review', 'dependsOn' => []]], 'finalCriteria' => 'A reviewed report']),
            'agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id']];
        $workflow = app(Workflows::class)->activate($this->user->id, $spec, 'org-workflow');
        app(WorkflowProgress::class)->advance($workflow['id']);
        $worker = Workflow::findOrFail($workflow['id'])->steps[0]['runId']; $this->assertNotNull($worker);
        foreach ([$plan->id, $worker] as $id) $this->assertDatabaseHas('agent_organisation_runs', ['run_id' => $id, 'organization_id' => $this->org->id]);
        OrganizationMember::where('user_id', $this->user->id)->delete();
        $this->assertSame(2, Maintenance::stopRevoked());
        app(WorkflowProgress::class)->advance($workflow['id']);
        $this->assertSame('blocked', Workflow::findOrFail($workflow['id'])->status);
        $this->assertSame(2, DB::table('agent_runs')->count());
    }
}
