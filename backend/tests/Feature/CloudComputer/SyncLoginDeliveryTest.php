<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{AccessProviders, SyncLogins};
use Illuminate\Support\Facades\DB;

class SyncLoginDeliveryTest extends SyncTestCase
{
    private function sendCloud(string $provider, int $seq): void
    {
        $content = 'FIXTURE-SEALED-LOGIN';
        $query = http_build_query(['seq' => $seq, 'sha256' => hash('sha256', $content), 'origin' => 'cloud']);
        $this->raw('PUT', '/api/cloud-computer/sync/login/'.$provider.'?'.$query, $content, 'cloud-test')->assertOk();
    }

    private function ack(string $runtime, string $provider, array $result): void
    {
        $id = DB::table('cloud_sync_logins')->where('provider', $provider)->value('blob_id');
        $this->asRuntime($runtime, 'post', 'sync/blobs/'.$id.'/applied', $result)->assertOk();
    }

    private function login(string $provider = 'claude'): array
    {
        return $this->getJson('/api/cloud-computer/access')->assertOk()->json('providers.'.$provider.'.cloudLogin');
    }

    public function test_failed_delivery_is_visible_with_its_sequence_after_the_blob_is_removed(): void
    {
        $runtime = $this->vmReady();
        $this->sendCloud('claude', 1);
        $this->ack($runtime, 'claude', ['ok' => false, 'error' => 'could not write the login']);
        $login = $this->login();
        $this->assertFalse($login['pending']);
        $this->assertSame([1, 0, null], [$login['seq'], $login['appliedSeq'], $login['appliedAt']]);
        $this->assertNotNull($login['failedAt']);
        $this->assertSame('Cloud could not save this sign-in. Try again.', $login['error']);
        $this->sync('get', '/')->assertOk()->assertJsonPath('logins.claude.failedAt', $login['failedAt'])
            ->assertJsonPath('logins.claude.error', $login['error']);
    }

    public function test_failed_newer_login_does_not_reuse_an_old_success_and_a_new_upload_clears_failure(): void
    {
        $runtime = $this->vmReady();
        $this->sendCloud('claude', 1);
        $this->ack($runtime, 'claude', ['ok' => true]);
        $this->assertNotNull($this->login()['appliedAt']);
        $this->sendCloud('claude', 2);
        $this->assertNull($this->login()['appliedAt']);
        $this->ack($runtime, 'claude', ['ok' => false, 'error' => 'could not open the login']);
        $login = $this->login();
        $this->assertSame([2, 1, null], [$login['seq'], $login['appliedSeq'], $login['appliedAt']]);
        $this->assertNotNull($login['failedAt']);
        $this->sendCloud('claude', 3);
        $this->assertSame(['appliedAt' => null, 'pending' => true, 'seq' => 3, 'appliedSeq' => 1, 'failedAt' => null, 'error' => null], $this->login());
        $this->ack($runtime, 'claude', ['ok' => true]);
        $this->assertNotNull($this->login()['appliedAt']);
        $this->assertNull($this->login()['failedAt']);
    }

    public function test_runtime_error_text_cannot_leak_credentials_and_copy_metadata_cannot_be_cloud_success(): void
    {
        $runtime = $this->vmReady();
        $this->sendCloud('codex', 1);
        $this->ack($runtime, 'codex', ['ok' => false, 'error' => 'secret=FIXTURE-PRIVATE-DO-NOT-EXPOSE']);
        $login = $this->login('codex');
        $this->assertSame('Vibyra Cloud could not finish this sign-in. Allow this account again.', $login['error']);
        $this->assertStringNotContainsString('FIXTURE-PRIVATE', json_encode(app(SyncLogins::class)->payload($this->user->id)));
        DB::table('cloud_sync_logins')->where('provider', 'codex')->update(['origin' => null]);
        $this->assertSame(['appliedAt' => null, 'pending' => false, 'seq' => 0, 'appliedSeq' => 0, 'failedAt' => null, 'error' => null], $this->login('codex'));
    }

    public function test_the_isolated_runner_loads_the_reviewed_delivery_classes(): void
    {
        foreach ([SyncLogins::class, AccessProviders::class] as $class) {
            $this->assertStringStartsWith(base_path().'/app/', (new \ReflectionClass($class))->getFileName());
        }
    }
}
