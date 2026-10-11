<?php
namespace Tests\Feature;
use App\Models\OrganizationMember;
use App\Services\AgentOrganizations\{Definitions, Instances, Overview};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\AgentOrganisationFixture;
use Tests\TestCase;
final class AgentOrganisationDefinitionsTest extends TestCase
{
    use RefreshDatabase, AgentOrganisationFixture;
    protected function setUp(): void { parent::setUp(); $this->bootOrganisation(); }
    public function test_members_use_private_instances_with_no_private_data_or_grants_copied(): void
    {
        DB::table('agent_teammates')->where('id', $this->agent['id'])->update(['memory' => 'owner-private-memory']);
        $member = $this->colleague(); $use = Instances::adopt($member->id, $this->definition['id'], 1, $this->definition['reviewHash']);
        $this->assertNotSame($this->agent['id'], $use['agentId']);
        $this->assertSame('', DB::table('agent_teammates')->where('id', $use['agentId'])->value('memory'));
        $this->assertSame(0, DB::table('agent_grants')->where('agent_id', $use['agentId'])->count());
        $payload = Overview::get($member->id); $this->assertFalse($payload['team']['canManage']);
        $this->assertStringNotContainsString('owner-private-memory', json_encode($payload));
        $this->withToken('org-user-'.$member->id)->putJson('/api/agents/v2/organisation/definitions/'.$this->definition['id'],
            ['expectedRevision' => 1, 'name' => 'Steal', 'avatar' => 'assistant', 'instructions' => 'No', 'knowledge' => ''])->assertForbidden();
    }
    public function test_publication_replay_conflict_retirement_and_manager_downgrade(): void
    {
        $manager = $this->colleague('admin'); $uri = '/api/agents/v2/organisation/definitions/'.$this->definition['id'];
        $data = ['expectedRevision' => 1, 'name' => 'Review', 'avatar' => 'assistant', 'instructions' => 'Research carefully.', 'knowledge' => 'Published'];
        $this->withToken('org-user-'.$manager->id)->putJson($uri, $data)->assertOk()->assertJsonPath('definition.revision', 2);
        $this->putJson($uri, $data)->assertOk()->assertJsonPath('definition.revision', 2);
        $this->putJson($uri, [...$data, 'knowledge' => 'Conflicting'])->assertConflict();
        OrganizationMember::where('user_id', $manager->id)->update(['role' => 'member']);
        $this->putJson($uri, [...$data, 'expectedRevision' => 2])->assertForbidden();
        $this->withToken('v2-session')->deleteJson($uri, ['expectedRevision' => 2])->assertOk()->assertJsonPath('definition.retired', true);
        $this->deleteJson($uri, ['expectedRevision' => 2])->assertOk();
        $this->assertSame(2, DB::table('agent_organisation_versions')->where('definition_id', $this->definition['id'])->count());
    }
    public function test_cross_organisation_definition_cannot_be_adopted_and_nonmember_is_empty(): void
    {
        $other = \App\Models\User::factory()->create();
        $this->assertNull(Overview::get($other->id)['team']);
        app(\App\Services\Teams\Organizations::class)->create($other, 'Other');
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        Instances::adopt($other->id, $this->definition['id'], 1, $this->definition['reviewHash']);
    }
    public function test_personal_edit_cannot_overwrite_published_profile_but_private_memory_is_editable(): void
    {
        $service = app(\App\Services\Agents\Teammates::class);
        $body = ['name' => $this->agent['name'], 'brief' => $this->agent['brief'], 'avatar' => 'assistant', 'budget' => 1000,
            'memory' => 'My private note', 'integrations' => [], 'revision' => $this->agent['revision']];
        $saved = $service->save($this->user->id, $body, $this->agent['id']);
        $this->assertSame('My private note', $saved['memory']);
        $this->expectException(\Illuminate\Http\Exceptions\HttpResponseException::class);
        $service->save($this->user->id, [...$body, 'name' => 'Override', 'revision' => $saved['revision']], $this->agent['id']);
    }
    public function test_long_published_instructions_allow_private_profile_save_and_reject_stale_draft(): void
    {
        $this->user->forceFill(['plan' => 'pro', 'membership_ends_at' => now()->addDay()])->save();
        $published = $this->publish(['instructions' => str_repeat('Research carefully. ', 300)]);
        Instances::adopt($this->user->id, $published['id'], 2, $published['reviewHash']);
        $service = app(\App\Services\Agents\Teammates::class); $current = $service->payload($service->get($this->user->id, $this->agent['id']));
        $body = ['name' => $current['name'], 'brief' => $current['brief'], 'avatar' => $current['avatar'], 'budget' => $current['budget'],
            'memory' => 'Private note', 'integrations' => [], 'revision' => $current['revision']];
        $this->postJson('/api/agents/v1/teammates/'.$current['id'], $body)->assertOk()->assertJsonPath('teammate.memory', 'Private note');
        $this->postJson('/api/agents/v1/teammates/'.$current['id'], [...$body, 'brief' => $this->agent['brief']])->assertConflict()
            ->assertJsonPath('code', 'organisation_managed_profile');
    }
    public function test_audit_is_manager_only_bounded_and_contains_no_private_content(): void
    {
        $member = $this->colleague();
        $this->withToken('org-user-'.$member->id)->getJson('/api/agents/v2/organisation/audit')->assertForbidden();
        foreach (range(1, 60) as $i) \App\Services\AgentOrganizations\Audit::record($this->org->id, $this->user->id, 'definition.published', $this->definition['id'], $i);
        $page = $this->withToken('v2-session')->getJson('/api/agents/v2/organisation/audit')->assertOk()->json();
        $this->assertCount(50, $page['events']); $this->assertNotNull($page['nextCursor']);
        $this->assertStringNotContainsString('Company launch date', json_encode($page));
        $next = $this->getJson('/api/agents/v2/organisation/audit?cursor='.$page['nextCursor'])->assertOk()->json('events');
        $this->assertEmpty(array_intersect(array_column($page['events'], 'id'), array_column($next, 'id')));
        $this->getJson('/api/agents/v2/organisation/audit?cursor=999999')->assertUnprocessable();
    }
}
