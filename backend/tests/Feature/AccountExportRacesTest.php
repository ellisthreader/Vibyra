<?php
namespace Tests\Feature;

use App\Models\AccountExport;
use App\Services\Privacy\{AccountExports, ExportBuilder};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

class AccountExportRacesTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp(); $this->bootV2(); Queue::fake(); Storage::fake('local');
        config(['reliability.export.enabled' => true, 'reliability.export.disk' => 'local']);
    }

    public function test_a_late_build_cleans_its_file_if_the_account_was_deleted_during_build(): void
    {
        $export = app(AccountExports::class)->request($this->user);
        $path = AccountExports::directory($this->user->id).'/'.$export->id.'.zip';
        $mock = \Mockery::mock(new ExportBuilder);
        $this->app->instance(ExportBuilder::class, $mock);
        $mock->shouldReceive('build')->once()->andReturnUsing(function ($user, $path) {
                $user->delete(); // deletion and its directory cleanup won while the archive was being built.
                Storage::disk('local')->put($path, 'late archive');
                return 12;
        });
        app(AccountExports::class)->build($export->id);
        $this->assertDatabaseCount('account_exports', 0);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_a_build_that_was_reaped_cannot_later_publish_an_archive(): void
    {
        $export = app(AccountExports::class)->request($this->user);
        $path = AccountExports::directory($this->user->id).'/'.$export->id.'.zip';
        $mock = \Mockery::mock(new ExportBuilder);
        $this->app->instance(ExportBuilder::class, $mock);
        $mock->shouldReceive('build')->once()->andReturnUsing(function ($user, $path) use ($export) {
                AccountExport::whereKey($export->id)->update(['status' => 'failed', 'error' => 'stalled']);
                Storage::disk('local')->put($path, 'late archive');
                return 12;
        });
        app(AccountExports::class)->build($export->id);
        $this->assertSame('failed', $export->fresh()->status);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_a_storage_write_refusal_marks_the_build_failed_and_returns_the_allowance(): void
    {
        $export = app(AccountExports::class)->request($this->user);
        $disk = \Mockery::mock(\Illuminate\Contracts\Filesystem\Filesystem::class);
        $disk->shouldReceive('put')->once()->andReturn(false);
        $disk->shouldReceive('delete')->once()->andReturn(true);
        $sync = Storage::fake((string) config('cloud_workspaces.sync_disk'));
        Storage::shouldReceive('disk')->with((string) config('cloud_workspaces.sync_disk'))->andReturn($sync);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        app(AccountExports::class)->build($export->id);
        $this->assertSame('failed', $export->fresh()->status);
        $this->assertTrue(app(AccountExports::class)->status($this->user)['canRequest']);
    }

    public function test_account_deletion_does_not_leave_an_archive_when_storage_refuses_cleanup(): void
    {
        $export = app(AccountExports::class)->request($this->user);
        $disk = \Mockery::mock(\Illuminate\Contracts\Filesystem\Filesystem::class);
        $disk->shouldReceive('deleteDirectory')->once()->andReturn(false);
        $sync = Storage::fake((string) config('cloud_workspaces.sync_disk'));
        Storage::shouldReceive('disk')->with((string) config('cloud_workspaces.sync_disk'))->andReturn($sync);
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        try { app(\App\Services\Account\AccountDeletion::class)->delete($this->user); $this->fail('Deletion ignored an archive cleanup failure'); }
        catch (\RuntimeException $e) { $this->assertSame('The account archive could not be removed.', $e->getMessage()); }
        $this->assertDatabaseHas('users', ['id' => $this->user->id]);
        $this->assertDatabaseHas('account_exports', ['id' => $export->id]);
    }
}
