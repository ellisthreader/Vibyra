<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\AccessProjects;
use Illuminate\Support\Facades\DB;

/** "Connect to cloud" with project ticks (docs/cloud-access-contract.md, Connect): consent version 3. */
class AccessConnectTest extends SyncTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.connect_consent_version' => 3, 'cloud_workspaces.connect_requires_face' => false]);
        DB::table('cloud_connect_consents')->delete();
    }

    private function connect(array $body): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/cloud-computer/connect', $body);
    }

    public function test_the_default_consent_version_is_3_and_version_2_is_refused(): void
    {
        $defaults = require config_path('cloud_workspaces.php');
        $this->assertSame(3, $defaults['connect_consent_version']);
        $this->connect(['accept' => true, 'consentVersion' => 2])->assertStatus(409)->assertJsonPath('code', 'consent_outdated')->assertJsonPath('current', 3);
        $this->assertSame(0, DB::table('cloud_connect_consents')->count());
    }

    public function test_connect_records_the_ticked_projects_as_allowed(): void
    {
        $this->connect(['accept' => true, 'consentVersion' => 3, 'projects' => [['id' => 'mac-proj-1', 'name' => 'Vibyra iOS'], ['id' => 'mac-proj-2', 'name' => ' Site ']]])
            ->assertOk()->assertJsonPath('connected', true)->assertJsonPath('capacity.computers.used', 1);
        $rows = DB::table('cloud_project_access')->orderBy('name')->get();
        $this->assertSame([['Site', AccessProjects::key('mac-proj-2'), true, 'phone'], ['Vibyra iOS', AccessProjects::key('mac-proj-1'), true, 'phone']],
            $rows->map(fn ($r) => [$r->name, $r->project_key, (bool) $r->allowed, $r->source])->all());
        $this->sync('post', '/projects', ['projectKey' => AccessProjects::key('mac-proj-1'), 'name' => 'vibyra-ios'])->assertOk();
    }

    public function test_bad_projects_are_refused_before_anything_is_kept(): void
    {
        foreach ([['projects' => 'nope'], ['projects' => [['id' => 'x']]], ['projects' => [['name' => 'X']]], ['projects' => array_fill(0, 101, ['id' => 'x', 'name' => 'X'])]] as $extra) {
            $this->connect(['accept' => true, 'consentVersion' => 3] + $extra)->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        }
        $this->assertSame([0, 0], [DB::table('cloud_connect_consents')->count(), DB::table('cloud_project_access')->count()]);
        $this->connect(['accept' => true, 'consentVersion' => 3])->assertOk(); // projects stay optional
    }

    public function test_disconnect_forgets_the_decisions(): void
    {
        $this->connect(['accept' => true, 'consentVersion' => 3, 'projects' => [['id' => 'p', 'name' => 'P']]])->assertOk();
        $this->deleteJson('/api/cloud-computer/connect')->assertOk();
        $this->assertSame(0, DB::table('cloud_project_access')->count());
    }
}
