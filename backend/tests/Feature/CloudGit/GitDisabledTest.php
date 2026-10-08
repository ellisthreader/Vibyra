<?php
namespace Tests\Feature\CloudGit;

use Illuminate\Support\Facades\{DB, Http};

/** GitHub turned off for Vibyra Cloud (docs/cloud-access-contract.md, "Accounts"): no credential, no pull request. */
class GitDisabledTest extends CloudGitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->makeComputer(); $this->queueProject('octo/hello'); $this->connectGithub(); $this->fakeRepo();
        DB::table('cloud_access_settings')->insert(['user_id' => $this->user->id, 'github_enabled' => false, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_the_vm_gets_no_git_credential(): void
    {
        foreach ([['op' => 'fetch'], ['op' => 'push', 'branch' => 'vibyra/x']] as $q) {
            $this->credential(['repo' => 'octo/hello'] + $q)->assertStatus(403)->assertJsonPath('code', 'github_disabled')->assertJsonMissing(['password' => self::TOKEN]);
        }
        Http::assertNothingSent();
        DB::table('cloud_access_settings')->update(['github_enabled' => true]);
        $this->configureApp();
        $this->credential(['repo' => 'octo/hello', 'op' => 'fetch'])->assertOk();
    }

    public function test_no_pull_request_is_opened(): void
    {
        $this->withToken('cloud-test')->postJson('/api/cloud-computer/pull-request', ['project' => 'octo/hello', 'branch' => 'vibyra/fix', 'title' => 'Fix'])
            ->assertStatus(403)->assertJsonPath('code', 'github_disabled')->assertJsonPath('error', 'GitHub is turned off for Vibyra Cloud. Turn it on in Cloud settings.');
        Http::assertNothingSent();
    }
}
