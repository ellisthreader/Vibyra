<?php
namespace Tests\Feature\CloudComputer;

use App\Models\{User, VibyraSession};
use App\Services\CloudComputer\Owners\ConversationOwners;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** docs/cloud-switching-contract.md section 1: the owner record, its compare-and-set and the rules around it. */
class OwnerRecordTest extends ComputerTestCase
{
    private const ID = '5d0c1f4e-7a39-4c0e-9b84-2a6d3f1c8e77';

    private function pick(string $name = 'my-app', bool $allowed = true): void
    {
        $this->putJson('/api/cloud-computer/access/projects', ['projects' => [['id' => 'mac:'.$name, 'name' => $name, 'allowed' => $allowed]]])->assertOk();
    }

    private function move(string $to, int $generation, array $extra = [], string $provider = 'claude', string $id = self::ID, string $project = 'my-app')
    {
        return $this->putJson('/api/cloud-computer/owners/'.$provider.'/'.$id, ['project' => $project, 'to' => $to, 'generation' => $generation] + $extra);
    }

    public function test_a_missing_row_is_pc_and_a_move_bumps_the_generation_both_ways(): void
    {
        $this->getJson('/api/cloud-computer/owners')->assertOk()->assertExactJson(['ok' => true, 'owners' => []]);
        $this->pick();
        $r = $this->move('cloud', 0, ['title' => "  Fix the\nlogin bug "])->assertOk()->json();
        $this->assertSame(['claude', self::ID, 'my-app', 'cloud', 1, 'Fix the login bug'], [$r['provider'], $r['id'], $r['project'], $r['owner'], $r['generation'], $r['title']]);
        $this->assertNotNull($r['updatedAt']);
        $row = $this->getJson('/api/cloud-computer/owners?project=my-app')->assertOk()->json('owners.0');
        $this->assertSame(['cloud', 1], [$row['owner'], $row['generation']]);
        $back = $this->move('pc', 1)->assertOk()->json();
        $this->assertSame(['pc', 2, 'Fix the login bug'], [$back['owner'], $back['generation'], $back['title']], 'a move without a title keeps the title');
        $this->assertSame(1, DB::table('cloud_conversation_owners')->count());
    }

    public function test_a_stale_generation_gets_owner_changed_with_the_current_row_and_changes_nothing(): void
    {
        $this->pick();
        $this->move('cloud', 0)->assertOk();
        $r = $this->move('cloud', 0)->assertStatus(409)->assertJsonPath('error', 'owner_changed')->assertJsonPath('code', 'owner_changed')->json();
        $this->assertSame(['cloud', 1, 'my-app'], [$r['current']['owner'], $r['current']['generation'], $r['current']['project']]);
        $this->assertSame(1, (int) DB::table('cloud_conversation_owners')->value('generation'));
        // A generation ahead of the row is just as stale, and a missing row is generation 0.
        $this->move('pc', 7)->assertStatus(409)->assertJsonPath('current.generation', 1);
        $miss = $this->move('pc', 3, [], 'codex', 'rollout-abc')->assertStatus(409)->json('current');
        $this->assertSame(['pc', 0, null], [$miss['owner'], $miss['generation'], $miss['updatedAt']]);
        $this->assertSame(1, DB::table('cloud_conversation_owners')->count());
    }

    public function test_moving_to_cloud_needs_an_opted_in_project_and_unticking_brings_it_home(): void
    {
        $this->move('cloud', 0)->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        $this->assertSame(0, DB::table('cloud_conversation_owners')->count());
        $this->pick('my-app', false);
        $this->move('cloud', 0)->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        $this->pick('my-app', true);
        $this->move('cloud', 0)->assertOk();
        $this->move('cloud', 0, [], 'gemini', 'gem-1')->assertOk();
        $this->move('pc', 0, [], 'codex', 'rollout-1', 'other-app')->assertOk(); // a PC record elsewhere stays
        $this->pick('my-app', false);
        // Back on the PC: the rows stay as PC records with the counter kept going (never reset to 0), the PC record elsewhere untouched.
        $rows = collect($this->getJson('/api/cloud-computer/owners?project=my-app')->assertOk()->json('owners'));
        $this->assertSame([['pc', 2, null], ['pc', 2, null]], $rows->map(fn ($r) => [$r['owner'], $r['generation'], $r['title']])->all());
        $this->assertSame(['pc', 1], DB::table('cloud_conversation_owners')->where('agent_session_id', 'rollout-1')->get(['owner', 'generation'])->map(fn ($r) => [$r->owner, (int) $r->generation])->first());
    }

    public function test_a_synced_project_is_decided_by_its_key_not_by_a_same_named_tick(): void
    {
        $key = str_repeat('a', 32);
        DB::table('cloud_sync_projects')->insert(['user_id' => $this->user->id, 'project_key' => $key, 'name' => 'my-app', 'state' => 'synced', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('cloud_project_access')->insert(['user_id' => $this->user->id, 'project_key' => $key, 'name' => 'My App', 'allowed' => false, 'source' => 'phone', 'created_at' => now(), 'updated_at' => now()]);
        $this->move('cloud', 0)->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        DB::table('cloud_project_access')->update(['allowed' => true]);
        $this->move('cloud', 0)->assertOk();
    }

    public function test_native_cloud_projects_are_granted(): void
    {
        $this->createComputer();
        DB::table('cloud_computer_projects')->insert(['id' => (string) Str::uuid(), 'workspace_id' => $this->cid,
            'name' => 'my-app', 'state' => 'done', 'created_at' => now(), 'updated_at' => now()]);
        $this->move('cloud', 0)->assertOk()->assertJsonPath('generation', 1);
    }

    public function test_removed_sync_cannot_borrow_a_same_named_tick(): void
    {
        $this->pick();
        $this->move('pc', 0)->assertOk();
        DB::table('cloud_sync_projects')->insert(['user_id' => $this->user->id, 'project_key' => str_repeat('a', 32),
            'name' => 'my-app', 'state' => 'synced', 'removed_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->move('cloud', 1)->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        $this->assertDatabaseHas('cloud_conversation_owners', ['agent_session_id' => self::ID, 'owner' => 'pc', 'generation' => 1]);
    }

    public function test_agreement_and_plan_rules(): void
    {
        $this->pick();
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['disputed' => true]);
        $this->move('cloud', 0)->assertStatus(402)->assertJsonPath('code', 'not_eligible');
        $this->move('pc', 0)->assertOk(); // a lapsed account can still bring its work home
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['disputed' => false]);
        DB::table('cloud_connect_consents')->update(['revoked_at' => now()]);
        $this->move('pc', 1)->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->move('cloud', 0, [], 'claude', 'x1')->assertStatus(409)->assertJsonPath('code', 'connect_required');
    }

    public function test_input_is_validated(): void
    {
        $this->pick();
        $this->move('cloud', 0, [], 'openai')->assertStatus(422);
        $this->move('cloud', 0, [], 'claude', 'has space')->assertStatus(422);
        $this->move('cloud', 0, [], 'claude', str_repeat('a', 101))->assertStatus(422);
        $this->move('cloud', 0, [], 'claude', self::ID, '../etc')->assertStatus(422);
        $this->move('cloud', 0, [], 'claude', self::ID, str_repeat('p', 65))->assertStatus(422);
        $this->move('moon', 0)->assertStatus(422);
        $this->move('cloud', -1)->assertStatus(422);
        $this->move('cloud', 0, ['title' => str_repeat('t', 501)])->assertStatus(422);
        $this->putJson('/api/cloud-computer/owners/claude/'.self::ID, ['to' => 'cloud', 'generation' => 0])->assertStatus(422);
        $this->getJson('/api/cloud-computer/owners?project=../x')->assertStatus(422);
        $this->move('cloud', 0, ['title' => str_repeat('é', 400)])->assertOk();
        $this->assertSame(200, mb_strlen((string) DB::table('cloud_conversation_owners')->value('title')));
        $this->assertSame(0, DB::table('cloud_conversation_owners')->where('provider', 'openai')->count());
    }

    public function test_rows_are_per_account(): void
    {
        $this->pick();
        $this->move('cloud', 0)->assertOk();
        $other = User::factory()->create(['email_verified_at' => now()]);
        app(\App\Services\Vibes\Wallet::class)->ensure($other);
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'other-test'), 'device_name' => 'phone',
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addMonth()]);
        $this->consent($other->id);
        $this->withToken('other-test')->getJson('/api/cloud-computer/owners')->assertOk()->assertJsonPath('owners', []);
        // The same conversation id under another account is its own record at generation 0.
        $this->withToken('other-test')->putJson('/api/cloud-computer/owners/claude/'.self::ID, ['project' => 'my-app', 'to' => 'pc', 'generation' => 0])->assertOk()->assertJsonPath('generation', 1);
        $this->withToken('cloud-test');
        $this->assertSame('cloud', $this->getJson('/api/cloud-computer/owners')->json('owners.0.owner'));
        $this->withToken('nobody')->getJson('/api/cloud-computer/owners')->assertStatus(401);
    }

    public function test_writes_are_rate_limited_and_bounded(): void
    {
        $this->pick();
        for ($i = 0; $i < 30; $i++) $this->move('pc', $i)->assertOk();
        $this->move('pc', 30)->assertStatus(429);
        $this->getJson('/api/cloud-computer/owners')->assertOk();
    }

    public function test_the_account_cap_refuses_new_rows_but_not_updates(): void
    {
        $this->pick();
        $this->move('pc', 0)->assertOk();
        $rows = [];
        for ($i = 0; $i < ConversationOwners::MAX_PER_USER - 1; $i++) {
            $rows[] = ['user_id' => $this->user->id, 'provider' => 'codex', 'agent_session_id' => 'seed-'.$i, 'project' => 'my-app', 'owner' => 'pc', 'generation' => 0, 'created_at' => now(), 'updated_at' => now()];
        }
        foreach (array_chunk($rows, 500) as $chunk) DB::table('cloud_conversation_owners')->insert($chunk);
        $this->move('pc', 0, [], 'claude', 'one-too-many')->assertStatus(422)->assertJsonPath('code', 'too_many_conversations');
        $this->move('pc', 1)->assertOk();
    }

    private function seedEvent(): void
    {
        DB::table('cloud_host_events')->insert(['user_id' => $this->user->id, 'provider' => 'claude', 'agent_session_id' => self::ID, 'project' => 'my-app',
            'phase' => 'finished', 'at' => now()->format('Y-m-d H:i:s.u'), 'created_at' => now()]);
    }

    public function test_disconnecting_cloud_and_deleting_the_account_drop_the_records(): void
    {
        $this->pick();
        $this->move('cloud', 0)->assertOk();
        $this->seedEvent();
        $this->deleteJson('/api/cloud-computer/connect')->assertOk();
        $this->assertSame([0, 0], [DB::table('cloud_conversation_owners')->count(), DB::table('cloud_host_events')->count()]);
        DB::table('cloud_conversation_owners')->insert(['user_id' => $this->user->id, 'provider' => 'claude', 'agent_session_id' => self::ID, 'project' => 'my-app',
            'owner' => 'cloud', 'generation' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $this->seedEvent();
        app(\App\Services\CloudWorkspaces\AccountCleanup::class)->prepare($this->user->id);
        $this->assertSame([0, 0], [DB::table('cloud_conversation_owners')->count(), DB::table('cloud_host_events')->count()]);
    }

    public function test_download_my_data_lists_the_owner_records_without_internal_ids(): void
    {
        $this->pick();
        $this->move('cloud', 0, ['title' => 'Fix the login bug'])->assertOk();
        $rows = array_values(array_filter(iterator_to_array((new \App\Services\Privacy\ExportSections())->for($this->user)['projects.json'], false), fn ($r) => $r['kind'] === 'cloud-conversation-owner'));
        $this->assertSame([['kind', 'provider', 'project', 'owner', 'title', 'updatedAt']], [array_keys($rows[0])]);
        $this->assertSame(['claude', 'my-app', 'cloud', 'Fix the login bug'], [$rows[0]['provider'], $rows[0]['project'], $rows[0]['owner'], $rows[0]['title']]);
    }
}
