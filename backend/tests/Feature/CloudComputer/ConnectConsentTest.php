<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Support\Facades\DB;

/** Nothing cloud happens until the phone's "Connect to cloud" agreement: it is recorded, makes the computer, and is the Mac's sync consent. */
class ConnectConsentTest extends SyncTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_workspaces.connect_consent_version' => 1]); // these tests drive the version by hand
        config(['cloud_workspaces.connect_requires_face' => false]); // the Face ID step has its own tests (CloudFaceKeyTest)
        DB::table('cloud_connect_consents')->delete();
    }

    private function connect(array $body = ['accept' => true, 'consentVersion' => 1]): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('User-Agent', 'Vibyra iOS test')->postJson('/api/cloud-computer/connect', $body);
    }

    private function counts(): array
    {
        return [DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->count(), DB::table('cloud_connect_consents')->count()];
    }

    public function test_a_never_connected_account_reads_no_computer(): void
    {
        $this->getJson('/api/cloud-computer')->assertOk()->assertJsonPath('enabled', true)->assertJsonPath('connected', false)
            ->assertJsonPath('consentVersion', 1)->assertJsonPath('computer', null);
        $this->assertSame([0, 0], $this->counts());
        $this->sync('get', '')->assertOk()->assertJsonPath('consent', null);
    }

    public function test_an_outdated_version_is_refused_with_the_current_one(): void
    {
        config(['cloud_workspaces.connect_consent_version' => 2]);
        $this->connect()->assertStatus(409)->assertJsonPath('code', 'consent_outdated')->assertJsonPath('current', 2);
        $this->assertSame([0, 0], $this->counts());
    }

    public function test_accept_must_be_ticked(): void
    {
        $this->connect(['consentVersion' => 1])->assertStatus(422)->assertJsonPath('ok', false)->assertJsonPath('code', 'invalid_request');
        $this->connect(['accept' => false, 'consentVersion' => 1])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->assertSame([0, 0], $this->counts());
    }

    public function test_a_free_account_is_refused_and_no_consent_is_kept(): void
    {
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete();
        $status = $this->connect()->status();
        $this->assertGreaterThanOrEqual(400, $status);
        $this->assertSame([0, 0], $this->counts());
    }

    public function test_connecting_makes_the_computer_records_the_consent_and_covers_the_terms(): void
    {
        $s = $this->connect()->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('ok', true)
            ->assertJsonPath('connected', true)->assertJsonPath('consentVersion', 1)->json();
        $this->assertSame('stopped', $s['computer']['state']);
        $row = DB::table('cloud_workspaces')->where('user_id', $this->user->id)->where('kind', 'computer')->first();
        $this->assertNotNull($row->terms_accepted_at);
        $c = DB::table('cloud_connect_consents')->where('user_id', $this->user->id)->first();
        $this->assertSame([1, 'phone', 'Vibyra iOS test'], [(int) $c->version, $c->source, $c->user_agent]);
        $this->assertSame(hash('sha256', '127.0.0.1'.config('app.key')), $c->ip_hash);
        $this->assertNull($c->revoked_at);
        $this->getJson('/api/cloud-computer')->assertJsonPath('connected', true)->assertJsonPath('computer.workspaceId', $row->id);
        $this->sync('get', '')->assertOk()->assertJsonPath('consent.version', 1)->assertJsonPath('consent.acceptedAt', fn ($v) => is_string($v) && $v !== '');
        $this->wake(false)->assertStatus(202); // no extra terms sheet at the first wake
    }

    public function test_connecting_again_keeps_one_computer_and_another_record(): void
    {
        $id = $this->connect()->assertOk()->json('computer.workspaceId');
        $this->connect()->assertOk()->assertJsonPath('computer.workspaceId', $id);
        $this->assertSame([1, 2], $this->counts());
    }

    public function test_a_revoked_or_older_consent_does_not_count(): void
    {
        $this->consent($this->user->id);
        DB::table('cloud_connect_consents')->update(['revoked_at' => now()]);
        $this->getJson('/api/cloud-computer')->assertJsonPath('connected', false)->assertJsonPath('computer', null);
        $this->consent($this->user->id, 1);
        config(['cloud_workspaces.connect_consent_version' => 2]);
        $this->getJson('/api/cloud-computer')->assertJsonPath('connected', false)->assertJsonPath('computer', null);
    }

    public function test_the_old_create_call_needs_the_connect_agreement(): void
    {
        $this->postJson('/api/cloud-computer', ['id' => $this->cid])->assertStatus(409)->assertJsonPath('code', 'connect_required');
        $this->assertSame([0, 0], $this->counts());
    }
}
