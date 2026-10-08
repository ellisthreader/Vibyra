<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{SyncKeys, SyncUpload};
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Testing\TestResponse;
use Mockery;

/** Ciphertext target binding is checked again after streaming, under admission locks. */
class SyncLoginTargetVmKeyTest extends SyncTestCase
{
    private string $vm;
    private string $target;

    protected function setUp(): void
    {
        parent::setUp();
        $this->vm = $this->vmReady();
        $this->target = str_repeat('b2', 32);
    }

    private function upload(int $seq, array $query = []): TestResponse
    {
        $content = 'FIXTURE-SEALED-LOGIN-'.bin2hex(random_bytes(24));
        $q = $query + ['seq' => $seq, 'sha256' => hash('sha256', $content), 'origin' => 'cloud'];
        return $this->raw('PUT', '/api/cloud-computer/sync/login/codex?'.http_build_query($q), $content, 'cloud-test');
    }

    private function loginRow(): object
    {
        return DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->where('provider', 'codex')->first();
    }

    private function unchanged(object $before): void
    {
        $after = $this->loginRow();
        foreach (['seq', 'blob_id', 'path', 'sha256', 'applied_seq'] as $field) $this->assertSame($before->$field, $after->$field);
        Storage::disk('cloud-sync')->assertExists($before->path);
        $this->assertSame([$before->path], Storage::disk('cloud-sync')->allFiles());
    }

    public function test_matching_cloud_key_is_accepted(): void
    {
        $this->upload(1, ['targetVmKey' => $this->target])->assertOk()->assertJsonPath('logins.codex.seq', 1);
        $this->assertSame($this->target, app(SyncKeys::class)->vmKey($this->user->id));
        $this->assertNotNull($this->loginRow()->blob_id);
        Storage::disk('cloud-sync')->assertExists($this->loginRow()->path);
    }

    public function test_mismatched_key_rejects_without_replacing_prior_login_or_leaking_file(): void
    {
        $this->upload(1)->assertOk(); $before = $this->loginRow();
        $this->upload(2, ['targetVmKey' => str_repeat('c3', 32)])->assertStatus(409)->assertJsonPath('code', 'vm_key_changed');
        $this->unchanged($before);
    }

    public function test_missing_current_key_rejects_without_changing_sequence_or_prior_blob(): void
    {
        $this->upload(1)->assertOk(); $before = $this->loginRow();
        DB::table('cloud_sync_vm_keys')->where('user_id', $this->user->id)->update(['public_key' => null]);
        $this->upload(2, ['targetVmKey' => $this->target])->assertStatus(409)->assertJsonPath('code', 'vm_key_changed');
        $this->unchanged($before);
    }

    public function test_key_rotated_during_stream_store_is_rechecked_at_final_admission(): void
    {
        $this->upload(1)->assertOk(); $before = $this->loginRow(); $stored = null; $rotated = null;
        $mock = Mockery::mock(SyncUpload::class)->makePartial();
        $mock->shouldReceive('store')->once()->andReturnUsing(function ($tmp, $path) use (&$stored, &$rotated) {
            (new SyncUpload)->store($tmp, $path); $stored = $path;
            $this->asRuntime($this->vm, 'post', 'sync/key', ['publicKey' => str_repeat('d4', 32)])->assertOk();
            $rotated = $this->loginRow(); // Rotation deliberately drops ciphertext sealed to the previous key.
        });
        $this->app->instance(SyncUpload::class, $mock);
        $this->upload(2, ['targetVmKey' => $this->target])->assertStatus(409)->assertJsonPath('code', 'vm_key_changed');
        $this->assertSame(str_repeat('d4', 32), app(SyncKeys::class)->vmKey($this->user->id));
        Storage::disk('cloud-sync')->assertMissing($stored);
        $after = $this->loginRow();
        $this->assertSame($before->seq, $after->seq);
        foreach (['seq', 'blob_id', 'path', 'sha256', 'applied_seq'] as $field) $this->assertSame($rotated->$field, $after->$field);
        $this->app->instance(SyncUpload::class, new SyncUpload);
        $this->upload(2, ['targetVmKey' => str_repeat('d4', 32)])->assertOk();
        $this->assertSame(2, (int) $this->loginRow()->seq);
    }

    public function test_present_target_must_be_required_exact_lowercase_hex_and_cloud_owned(): void
    {
        foreach (['', str_repeat('A', 64), str_repeat('b', 63), 'not-a-key', ['nested']] as $target) {
            $this->upload(1, ['targetVmKey' => $target])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        }
        $this->upload(1, ['targetVmKey' => $this->target, 'origin' => ''])->assertStatus(422)->assertJsonPath('code', 'invalid_request');
        $this->assertSame([], Storage::disk('cloud-sync')->allFiles());
        $this->assertNull(DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->first());
    }

    public function test_legacy_cloud_and_copy_uploads_may_omit_target_key(): void
    {
        DB::table('cloud_sync_vm_keys')->where('user_id', $this->user->id)->update(['public_key' => null]);
        $this->upload(1, ['origin' => ''])->assertOk()->assertJsonPath('logins.codex.origin', null);
        $this->upload(2)->assertOk()->assertJsonPath('logins.codex.origin', 'cloud');
        $this->assertSame(2, (int) $this->loginRow()->seq);
    }
}
