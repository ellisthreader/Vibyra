<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\AccessProjects;
use App\Services\CloudComputer\Owners\ConversationOwners;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\DB;

/** Review fixes: which owner rows an untick drops, the opt-in re-check inside `set`, one project per record, a counter that never restarts. */
class OwnerGuardsTest extends SyncTestCase
{
    private const X = '5d0c1f4e-7a39-4c0e-9b84-2a6d3f1c8e77';
    private const Y = '9a8b7c6d-1111-4222-8333-444455556666';

    private function tick(string $id, string $name, bool $allowed = true): string
    {
        $this->putJson('/api/cloud-computer/access/projects', ['projects' => [['id' => $id, 'name' => $name, 'allowed' => $allowed]]])->assertOk();
        return AccessProjects::key($id);
    }

    private function move(string $to, int $generation, string $project, string $id = self::X, string $provider = 'claude')
    {
        return $this->putJson('/api/cloud-computer/owners/'.$provider.'/'.$id, ['project' => $project, 'to' => $to, 'generation' => $generation]);
    }

    private function owner(string $id): array
    {
        return (array) DB::table('cloud_conversation_owners')->where('agent_session_id', $id)->first(['owner', 'generation', 'project']);
    }

    public function test_unticking_the_second_of_two_same_named_projects_leaves_the_first_ones_conversations(): void
    {
        $a = $this->tick('mac:api-a', 'api');
        $b = $this->tick('mac:api-b', 'api');
        $this->sync('post', '/projects', ['projectKey' => $a, 'name' => 'api'])->assertOk()->assertJsonPath('project.name', 'api');
        $second = $this->sync('post', '/projects', ['projectKey' => $b, 'name' => 'api'])->assertOk()->json('project.name');
        $this->assertSame('api-'.substr($b, 0, 4), $second, 'the second project is filed under a suffixed sync name');
        $this->move('cloud', 0, 'api', self::X)->assertOk();
        $this->move('cloud', 0, $second, self::Y)->assertOk();
        $this->tick('mac:api-b', 'api', false);
        $this->assertSame(['cloud', 1, 'api'], array_values($this->owner(self::X)), 'the first project keeps its conversation in Cloud');
        $this->assertSame(['pc', 2, $second], array_values($this->owner(self::Y)));
        // And the other way round: unticking the first now brings its conversation home.
        $this->tick('mac:api-a', 'api', false);
        $this->assertSame(['pc', 2], [$this->owner(self::X)['owner'], $this->owner(self::X)['generation']]);
    }

    public function test_an_unsynced_tick_name_drops_its_rows_unless_another_project_still_owns_the_name(): void
    {
        $this->tick('mac:solo', 'solo');
        $this->move('cloud', 0, 'solo', self::X)->assertOk();
        $this->tick('mac:solo', 'solo', false);
        $this->assertSame('pc', $this->owner(self::X)['owner']);
        // Two never-synced ticks share a name: unticking one leaves the name's conversations while the other is still ticked.
        $this->tick('mac:dup-1', 'dup');
        $this->tick('mac:dup-2', 'dup');
        $this->move('cloud', 0, 'dup', self::Y)->assertOk();
        $this->tick('mac:dup-2', 'dup', false);
        $this->assertSame('cloud', $this->owner(self::Y)['owner']);
        $this->tick('mac:dup-1', 'dup', false);
        $this->assertSame('pc', $this->owner(self::Y)['owner']);
    }

    public function test_the_opt_in_is_checked_inside_set_not_only_by_the_route(): void
    {
        $this->tick('mac:my-app', 'my-app', false);
        try {
            app(ConversationOwners::class)->set($this->user->id, 'claude', self::X, 'my-app', 'cloud', 0, null);
            $this->fail('set must refuse a project that is not opted in');
        } catch (HttpResponseException $e) {
            $this->assertSame(409, $e->getResponse()->getStatusCode());
            $this->assertSame('project_not_allowed', $e->getResponse()->getData(true)['code']);
        }
        $this->assertSame(0, DB::table('cloud_conversation_owners')->count());
        [$applied] = app(ConversationOwners::class)->set($this->user->id, 'claude', self::X, 'my-app', 'pc', 0, null);
        $this->assertTrue($applied, 'a move to the PC never needs the opt-in');
    }

    public function test_a_record_belongs_to_one_project_and_cannot_borrow_another_projects_opt_in(): void
    {
        $this->tick('mac:ticked', 'ticked');
        $this->move('pc', 0, 'never-ticked')->assertOk()->assertJsonPath('generation', 1);
        $r = $this->move('cloud', 1, 'ticked')->assertStatus(409)->assertJsonPath('code', 'project_mismatch')->json();
        $this->assertSame(['never-ticked', 'pc', 1], [$r['current']['project'], $r['current']['owner'], $r['current']['generation']]);
        $this->move('pc', 1, 'ticked')->assertStatus(409)->assertJsonPath('code', 'project_mismatch');
        $this->assertSame(['pc', 1, 'never-ticked'], array_values($this->owner(self::X)));
        // A stale generation is still the first answer; the record's own project still works.
        $this->move('cloud', 0, 'ticked')->assertStatus(409)->assertJsonPath('code', 'owner_changed');
        $this->tick('mac:never-ticked', 'never-ticked');
        $this->move('cloud', 1, 'never-ticked')->assertOk()->assertJsonPath('generation', 2);
    }

    public function test_the_generation_never_restarts_so_a_stale_holder_cannot_win_after_an_untick(): void
    {
        $this->tick('mac:my-app', 'my-app');
        $this->move('cloud', 0, 'my-app')->assertOk()->assertJsonPath('generation', 1); // a slow client reads (cloud, 1) here
        $this->tick('mac:my-app', 'my-app', false);
        $this->assertSame(['pc', 2, 'my-app'], array_values($this->owner(self::X)));
        $listed = $this->getJson('/api/cloud-computer/owners?project=my-app')->assertOk()->json('owners.0');
        $this->assertSame(['pc', 2, null], [$listed['owner'], $listed['generation'], $listed['title']], 'the phone reads the counter from the list');
        $this->tick('mac:my-app', 'my-app');
        $this->move('cloud', 2, 'my-app')->assertOk()->assertJsonPath('generation', 3); // cloud again
        $this->move('pc', 1, 'my-app')->assertStatus(409)->assertJsonPath('code', 'owner_changed')->assertJsonPath('current.generation', 3);
        $this->assertSame(['cloud', 3], [$this->owner(self::X)['owner'], $this->owner(self::X)['generation']]);
    }

    public function test_idle_pc_titles_are_forgotten_but_generation_tombstones_cloud_and_fresh_titles_stay(): void
    {
        $old = now()->subDays(ConversationOwners::PC_RECORD_DAYS + 1);
        $base = ['user_id' => $this->user->id, 'provider' => 'claude', 'project' => 'my-app', 'created_at' => $old, 'title' => 'Private title'];
        DB::table('cloud_conversation_owners')->insert([
            $base + ['agent_session_id' => 'old-pc', 'owner' => 'pc', 'generation' => 4, 'updated_at' => $old],
            $base + ['agent_session_id' => 'old-cloud', 'owner' => 'cloud', 'generation' => 1, 'updated_at' => $old],
            $base + ['agent_session_id' => 'new-pc', 'owner' => 'pc', 'generation' => 2, 'updated_at' => now()]]);
        $this->artisan('vibyra:cloud-activity-prune')->assertSuccessful();
        $this->assertSame(3, DB::table('cloud_conversation_owners')->count());
        $this->assertDatabaseHas('cloud_conversation_owners', ['agent_session_id' => 'old-pc', 'generation' => 4, 'title' => null]);
        $this->assertDatabaseHas('cloud_conversation_owners', ['agent_session_id' => 'old-cloud', 'title' => 'Private title']);
        $this->assertDatabaseHas('cloud_conversation_owners', ['agent_session_id' => 'new-pc', 'title' => 'Private title']);
        $this->tick('mac:my-app', 'my-app');
        $this->move('cloud', 0, 'my-app', 'old-pc')->assertStatus(409)->assertJsonPath('current.generation', 4);
        $this->move('cloud', 4, 'my-app', 'old-pc')->assertOk()->assertJsonPath('generation', 5);
        $this->move('pc', 1, 'my-app', 'old-pc')->assertStatus(409)->assertJsonPath('current.generation', 5);
    }

    public function test_a_move_between_sweep_selection_and_update_preserves_the_new_cloud_record(): void
    {
        $old = now()->subDays(ConversationOwners::PC_RECORD_DAYS + 1);
        DB::table('cloud_conversation_owners')->insert(['user_id' => $this->user->id, 'provider' => 'claude', 'agent_session_id' => self::X,
            'project' => 'my-app', 'owner' => 'pc', 'generation' => 4, 'title' => 'Old title', 'created_at' => $old, 'updated_at' => $old]);
        $moved = false;
        DB::listen(function ($query) use (&$moved) {
            if ($moved || !str_starts_with($query->sql, 'select') || !str_contains($query->sql, 'cloud_conversation_owners') || !str_contains($query->sql, 'title')) return;
            $moved = true; // deterministic interleaving: sweep selected the PC row; a valid move commits before its update.
            DB::table('cloud_conversation_owners')->where('agent_session_id', self::X)->update(['owner' => 'cloud', 'generation' => 5, 'title' => 'New title', 'updated_at' => now()]);
        });
        $this->assertSame(0, app(ConversationOwners::class)->sweep());
        $this->assertTrue($moved);
        $this->assertDatabaseHas('cloud_conversation_owners', ['agent_session_id' => self::X, 'owner' => 'cloud', 'generation' => 5, 'title' => 'New title']);
    }
}
