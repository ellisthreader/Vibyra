<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** The hosted-project routes must not act on the cloud computer: it has its own terms, passkey and revocation rules. */
class LegacyRoutesRefuseComputerTest extends ComputerTestCase
{
    public function test_every_legacy_workspace_route_treats_the_computer_id_as_missing(): void
    {
        $token = $this->computerReady();
        $id = $this->cid;
        $base = '/api/cloud-workspaces/'.$id;
        $this->getJson($base)->assertNotFound();
        $this->getJson($base.'/export')->assertNotFound();
        $this->getJson($base.'/receipts')->assertNotFound();
        $this->postJson($base.'/import', ['revision' => 0, 'consent' => true, 'files' => []])->assertNotFound();
        $this->postJson($base.'/quote', ['revision' => 1, 'deviceId' => $this->device->uuid, 'model' => 'test/model', 'budgetUnits' => 500000,
            'seconds' => 3600, 'canWrite' => true, 'commands' => []])->assertNotFound();
        $this->postJson($base.'/start', ['quoteId' => (string) Str::uuid(), 'proof' => 'AAAA', 'consent' => true])->assertNotFound();
        $this->postJson($base.'/stop')->assertNotFound();
        $this->postJson($base.'/access', ['deviceId' => $this->device->uuid])->assertNotFound();
        $this->postJson($base.'/budget', ['id' => (string) Str::uuid(), 'revision' => 0, 'budgetUnits' => 9, 'consent' => true])->assertNotFound();
        $this->postJson($base.'/preview', ['port' => 3000, 'consent' => true])->assertNotFound();
        $this->postJson($base.'/actions', ['id' => (string) Str::uuid(), 'operation' => 'snapshot', 'arguments' => []])->assertNotFound();
        $this->getJson($base.'/actions/'.Str::uuid())->assertNotFound();
        $this->postJson($base.'/actions/'.Str::uuid().'/cancel')->assertNotFound();
        $this->deleteJson($base, ['confirmed' => true])->assertNotFound();
        // Nothing happened to the computer.
        $row = $this->row();
        $this->assertNotSame('deleted', $row->state);
        $this->assertSame('computer', $row->kind);
        $this->assertNotNull($row->machine_id);
        // The computer's own routes still work, and the runtime's host loop is untouched.
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('computer.workspaceId', $id);
        $this->registerHost($token)->assertOk();
    }

    public function test_the_legacy_action_loop_is_refused_for_a_computer_runtime_but_heartbeat_works(): void
    {
        $token = $this->computerReady();
        $this->asRuntime($token, 'get', 'actions/next')->assertStatus(409);
        $this->asRuntime($token, 'post', 'actions/'.Str::uuid().'/result', ['result' => []])->assertStatus(409);
        $this->asRuntime($token, 'post', 'heartbeat', ['ready' => true])->assertOk();
        $this->assertSame(0, DB::table('cloud_actions')->where('workspace_id', $this->cid)->count());
    }

    public function test_hosted_projects_still_use_the_legacy_routes(): void
    {
        $project = $this->imported();
        $this->getJson('/api/cloud-workspaces/'.$project)->assertOk()->assertJsonPath('workspace.id', $project);
        $this->deleteJson('/api/cloud-workspaces/'.$project, ['confirmed' => true])->assertStatus(200);
    }
}
