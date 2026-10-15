<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\Activity\{EventAuthority, HostEvents};
use Illuminate\Support\Facades\{DB, Schema};

class ActivityRuntimeGenerationMigrationTest extends ActivityTestCase
{
    public function test_an_existing_activity_table_gains_a_nullable_generation_without_granting_legacy_rows_authority(): void
    {
        $this->liveComputer();
        $migration = require database_path('migrations/2026_10_15_130000_add_runtime_generation_to_cloud_host_events.php');
        $migration->down();
        $this->assertFalse(Schema::hasColumn('cloud_host_events', 'runtime_generation'));
        $id = DB::table('cloud_host_events')->insertGetId(['user_id' => $this->user->id, 'workspace_id' => $this->cid,
            'provider' => 'claude', 'agent_session_id' => self::A, 'project' => 'my-app', 'phase' => 'running',
            'title' => 'Preserved metadata', 'at' => HostEvents::stamp(now()), 'created_at' => now()]);
        $before = (array) DB::table('cloud_host_events')->where('id', $id)->first();
        $migration->up();
        $event = DB::table('cloud_host_events')->where('id', $id)->first();
        $this->assertNull($event->runtime_generation);
        $after = (array) $event; unset($after['runtime_generation']);
        $this->assertSame($before, $after);
        $this->assertNull(app(EventAuthority::class)->deliveryCurrent($event));
        $this->feed()->assertOk()->assertJsonPath('running', []);
        DB::table('cloud_host_events')->where('id', $id)->update(['runtime_generation' => $this->row()->generation]);
        $this->assertNotNull(app(EventAuthority::class)->deliveryCurrent(DB::table('cloud_host_events')->where('id', $id)->first()));
        $this->assertCount(1, $this->feed()->assertOk()->json('running'));
    }
}
