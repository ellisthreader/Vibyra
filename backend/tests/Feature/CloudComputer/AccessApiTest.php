<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\AccessProjects;
use Illuminate\Support\Facades\{DB, Storage};

/** What Vibyra Cloud may use (docs/cloud-access-contract.md): GET /access, the phone's ticks and the Codex policy. */
class AccessApiTest extends SyncTestCase
{
    private function access(string $method = 'get', string $path = '', array $body = []): \Illuminate\Testing\TestResponse
    {
        return $this->withToken('cloud-test')->{$method.'Json'}('/api/cloud-computer/access'.$path, $body);
    }

    public function test_get_access_has_the_contract_shape(): void
    {
        config(['cloud_workspaces.idle_seconds' => 300, 'cloud_workspaces.max_background_seconds' => 28800]);
        $r = $this->access()->assertOk()->assertJsonPath('ok', true)->assertJsonPath('projects', [])->json();
        $this->assertSame(['codex' => ['carryOver' => 'allowed', 'sent' => false, 'appliedAt' => null], 'claude' => ['carryOver' => 'unsupported']], $r['providers']);
        $this->assertSame(['computers' => ['used' => 0, 'limit' => 1], 'hours' => $r['capacity']['hours'], 'storage' => ['usedBytes' => 0, 'limitBytes' => 5368709120],
            'sessions' => ['active' => 0, 'limit' => null], 'idleStopSeconds' => 300, 'maxSessionSeconds' => 28800, 'projectLimit' => 100], $r['capacity']);
        $this->assertSame(['allowanceSeconds', 'usedSeconds', 'resetsAt', 'overage'], array_keys($r['capacity']['hours']));
        $this->createComputer();
        $this->access()->assertJsonPath('capacity.computers.used', 1);
    }

    public function test_allowing_by_mac_id_derives_the_key_and_lists_sync_rows(): void
    {
        $key = AccessProjects::key('proj-1');
        $this->assertSame(substr(hash('sha256', 'vibyra-project:proj-1'), 0, 32), $key);
        $rows = $this->access('put', '/projects', ['projects' => [['id' => 'proj-1', 'name' => 'Vibyra iOS', 'allowed' => true], ['id' => 'proj-2', 'name' => 'Another', 'allowed' => false]]])
            ->assertOk()->json('projects');
        $this->assertSame(['Another', 'Vibyra iOS'], array_column($rows, 'name'));
        $this->assertSame([$key, true, 'phone', ['state' => null, 'syncedAt' => null, 'bytes' => 0]], [$rows[1]['projectKey'], $rows[1]['allowed'], $rows[1]['source'], $rows[1]['cloud']]);
        $this->assertIsString($rows[1]['decidedAt']);
        // A Mac grant for the allowed key works and shows up as the cloud state of that row.
        $this->sync('post', '/projects', ['projectKey' => $key, 'name' => 'vibyra-ios'])->assertOk();
        $this->up('vibyra-ios', [], str_repeat('x', 100))->assertOk();
        $row = collect($this->access()->json('projects'))->firstWhere('projectKey', $key);
        $this->assertSame(['pending', 100], [$row['cloud']['state'], $row['cloud']['bytes']]);
        $this->assertSame([$key], $this->sync('get', '/')->json('access.projectKeys'));
    }

    public function test_denying_removes_the_cloud_copy_with_a_tombstone(): void
    {
        $this->registerMac(); $this->grant('my-app'); $this->up('my-app')->assertOk();
        $this->assertNotEmpty(Storage::disk('cloud-sync')->allFiles());
        $rows = $this->access('put', '/projects', ['projects' => [['projectKey' => $this->key, 'allowed' => false]]])->assertOk()->json('projects');
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $p = DB::table('cloud_sync_projects')->where('project_key', $this->key)->first();
        $this->assertNotNull($p->removed_at); // the VM sees `removed` and deletes the folder
        $this->assertSame([['Test project', false]], array_map(fn ($r) => [$r['name'], $r['allowed']], $rows)); // name kept from the earlier decision
        $this->assertSame([], $this->sync('get', '/')->json('access.projectKeys'));
        // The Mac cannot bring it back.
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'my-app'])->assertStatus(409)->assertJsonPath('code', 'project_not_allowed');
        $this->assertNotNull(DB::table('cloud_sync_projects')->where('id', $p->id)->value('removed_at'));
    }

    public function test_an_undecided_sync_row_is_listed_as_not_allowed(): void
    {
        $this->sync('post', '/projects', ['projectKey' => $this->key, 'name' => 'huge', 'skipped' => ['reason' => 'too_large']])->assertOk();
        $this->assertSame([['huge', false, null, 'skipped']], array_map(fn ($r) => [$r['name'], $r['allowed'], $r['source'], $r['cloud']['state']], $this->access()->json('projects')));
    }

    public function test_put_projects_validates_and_needs_the_connect_agreement(): void
    {
        foreach ([[], ['projects' => []], ['projects' => [['id' => 'x', 'name' => 'X']]], ['projects' => [['projectKey' => 'nothex', 'allowed' => true]]],
            ['projects' => array_fill(0, 101, ['id' => 'x', 'name' => 'X', 'allowed' => true])], ['projects' => [['allowed' => true, 'name' => 'X']]]] as $body) {
            $this->access('put', '/projects', $body)->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        }
        // A projectKey the account does not know needs a name.
        $this->access('put', '/projects', ['projects' => [['projectKey' => str_repeat('ab', 16), 'allowed' => true]]])->assertStatus(422);
        DB::table('cloud_connect_consents')->update(['revoked_at' => now()]);
        $this->access('put', '/projects', ['projects' => [['id' => 'x', 'name' => 'X', 'allowed' => true]]])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->access('put', '/providers/codex', ['carryOver' => 'blocked'])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->assertSame(0, DB::table('cloud_project_access')->count());
    }

    public function test_blocking_codex_drops_the_pending_login_and_refuses_new_ones(): void
    {
        $content = 'FIXTURE-SEALED-LOGIN';
        $send = fn (int $seq) => $this->raw('PUT', '/api/cloud-computer/sync/login/codex?'.http_build_query(['seq' => $seq, 'sha256' => hash('sha256', $content)]), $content, 'cloud-test');
        $send(1)->assertOk();
        $this->access('put', '/providers/codex', ['carryOver' => 'sideways'])->assertStatus(422);
        $this->access('put', '/providers/codex', ['carryOver' => 'blocked'])->assertOk()->assertJsonPath('providers.codex.carryOver', 'blocked')->assertJsonPath('providers.codex.sent', true);
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $send(2)->assertStatus(409)->assertJsonPath('code', 'login_blocked');
        $this->assertSame('blocked', $this->sync('get', '/')->json('access.codexCarryOver'));
        $this->access('put', '/providers/codex', ['carryOver' => 'allowed'])->assertOk();
        $send(2)->assertOk();
    }
}
