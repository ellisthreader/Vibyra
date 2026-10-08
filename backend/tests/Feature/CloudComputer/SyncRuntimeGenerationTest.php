<?php
namespace Tests\Feature\CloudComputer;

use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Support\Facades\DB;

final class SyncRuntimeGenerationTest extends SyncTestCase
{
    private function rotateAfterAuthenticationRead(): void
    {
        $rotated = false;
        DB::listen(function (QueryExecuted $query) use (&$rotated) {
            if ($rotated || !str_starts_with($query->sql, 'select * from "cloud_workspaces" where "id" = ?') || ($query->bindings[0] ?? null) !== $this->cid) return;
            $rotated = true;
            DB::table('cloud_workspaces')->where('id', $this->cid)->increment('generation', 1, ['runtime_token_hash' => hash('sha256', 'new-runtime-token')]);
        });
    }

    public function test_old_generation_cannot_replace_current_vm_key_after_authentication(): void
    {
        $token = $this->vmReady();
        $this->rotateAfterAuthenticationRead();
        $this->asRuntime($token, 'post', 'sync/key', ['publicKey' => str_repeat('c3', 32)])->assertStatus(401);
        $this->assertSame(str_repeat('b2', 32), DB::table('cloud_sync_vm_keys')->where('user_id', $this->user->id)->value('public_key'));
    }

    public function test_old_generation_cannot_set_current_applying_status_after_authentication(): void
    {
        $token = $this->vmReady();
        $this->rotateAfterAuthenticationRead();
        $this->asRuntime($token, 'post', 'sync/status', ['applying' => true])->assertStatus(401);
        $this->assertFalse((bool) DB::table('cloud_sync_vm_keys')->where('user_id', $this->user->id)->value('applying'));
    }

    public function test_old_generation_cannot_acknowledge_current_project_upload(): void
    {
        $token = $this->vmReady();
        $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $blob = DB::table('cloud_sync_blobs')->where('direction', 'up')->first();
        $this->rotateAfterAuthenticationRead();
        $this->asRuntime($token, 'post', 'sync/blobs/'.$blob->id.'/applied', ['ok' => true])->assertStatus(401);
        $this->assertNull(DB::table('cloud_sync_blobs')->where('id', $blob->id)->value('applied_at'));
    }

    public function test_old_generation_cannot_commit_cloud_to_mac_return(): void
    {
        $token = $this->vmReady();
        $this->registerMac();
        $this->grant('my-app');
        [$content, $q] = $this->q(['mac' => $this->deviceId]);
        $this->rotateAfterAuthenticationRead();
        $this->runtimeRaw($token, 'PUT', 'projects/my-app/down?'.http_build_query($q), $content)->assertStatus(401);
        $this->assertSame(0, DB::table('cloud_sync_blobs')->where('direction', 'down')->count());
        $this->assertSame(0, (int) DB::table('cloud_sync_projects')->where('user_id', $this->user->id)->value('down_seq'));
        $this->assertCount(0, \Illuminate\Support\Facades\Storage::disk('cloud-sync')->allFiles());
    }


    public function test_rolled_back_key_rotation_preserves_old_blob_and_key(): void
    {
        $this->vmReady();
        $this->grant('my-app');
        $this->up('my-app')->assertOk();
        $blob = DB::table('cloud_sync_blobs')->first();
        DB::beginTransaction();
        try { app(\App\Services\CloudComputer\SyncKeys::class)->setVmKey($this->user->id, str_repeat('c3', 32)); }
        finally { DB::rollBack(); }
        $this->assertSame(str_repeat('b2', 32), DB::table('cloud_sync_vm_keys')->where('user_id', $this->user->id)->value('public_key'));
        $this->assertNotNull(DB::table('cloud_sync_blobs')->where('id', $blob->id)->first());
        \Illuminate\Support\Facades\Storage::disk('cloud-sync')->assertExists($blob->path);
    }

    public function test_rolled_back_login_ack_preserves_pending_login_file(): void
    {
        $this->vmReady();
        $content = 'FIXTURE-SEALED-LOGIN-'.bin2hex(random_bytes(32));
        $id = (string) \Illuminate\Support\Str::uuid();
        $path = $this->user->id.'/logins/'.$id;
        \Illuminate\Support\Facades\Storage::disk('cloud-sync')->put($path, $content);
        DB::table('cloud_sync_logins')->insert(['user_id' => $this->user->id, 'provider' => 'codex', 'seq' => 1,
            'blob_id' => $id, 'path' => $path, 'bytes' => strlen($content), 'sha256' => hash('sha256', $content),
            'uploaded_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $login = DB::table('cloud_sync_logins')->where('user_id', $this->user->id)->first();
        DB::beginTransaction();
        try { $this->assertTrue(app(\App\Services\CloudComputer\SyncLogins::class)->applied($this->user->id, $login->blob_id, ['ok' => true])); }
        finally { DB::rollBack(); }
        $this->assertSame($login->blob_id, DB::table('cloud_sync_logins')->where('id', $login->id)->value('blob_id'));
        \Illuminate\Support\Facades\Storage::disk('cloud-sync')->assertExists($login->path);
    }


    public function test_old_generation_cannot_report_project_origins_for_new_generation(): void
    {
        $token = $this->vmReady();
        $this->rotateAfterAuthenticationRead();
        $this->asRuntime($token, 'post', 'host/activity', ['running' => 0, 'waitingApproval' => 0, 'projects' => [['name' => 'old-project', 'repo' => 'owner/old-repo']]])->assertStatus(401);
        $this->assertNull(DB::table('cloud_workspaces')->where('id', $this->cid)->value('host_projects'));
    }

    public function test_old_generation_cannot_complete_new_project_queue(): void
    {
        $token = $this->vmReady();
        $w = DB::table('cloud_workspaces')->where('id', $this->cid)->first();
        app(\App\Services\CloudComputer\Projects::class)->queue($w, 'new-project', null, null);
        $id = DB::table('cloud_computer_projects')->where('workspace_id', $this->cid)->value('id');
        $this->rotateAfterAuthenticationRead();
        $this->asRuntime($token, 'post', 'projects/'.$id.'/done', ['ok' => true])->assertStatus(401);
        $this->assertSame('pending', DB::table('cloud_computer_projects')->where('id', $id)->value('state'));
    }

}
