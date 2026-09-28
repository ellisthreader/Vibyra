<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\PublishedProjectRuntimeCleanup;
use App\Models\User;
use App\Services\Deployments\RuntimeDemoLifecycleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class RuntimeDemoLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_private_listing_stops_runtime_and_persists_cleanup(): void
    {
        [$project, $deployment] = $this->liveRuntime();

        app(RuntimeDemoLifecycleService::class)->retireProject($project, 'listing_private');

        $this->assertSame(PublishedProjectDeployment::STATUS_STOPPED, $deployment->fresh()->status);
        $this->assertNull($deployment->fresh()->public_url);
        $this->assertDatabaseHas('published_project_runtime_cleanups', [
            'provider_project_id' => 'railway_project_1',
            'status' => 'pending',
            'reason' => 'listing_private',
        ]);
    }

    public function test_cleanup_survives_listing_deletion(): void
    {
        [$project] = $this->liveRuntime();
        $lifecycle = app(RuntimeDemoLifecycleService::class);

        $lifecycle->retireProject($project, 'listing_deleted');
        $project->delete();

        $this->assertSame(1, PublishedProjectRuntimeCleanup::count());
        $this->assertDatabaseMissing('published_projects', ['id' => $project->id]);
    }

    public function test_new_publish_supersedes_only_pending_runtime_attempts(): void
    {
        [$project, $live] = $this->liveRuntime();
        $queued = PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_QUEUED,
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
        ]);

        app(RuntimeDemoLifecycleService::class)->supersedePending($project);

        $this->assertSame(PublishedProjectDeployment::STATUS_STOPPED, $queued->fresh()->status);
        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $live->fresh()->status);
    }

    public function test_user_limit_retires_oldest_live_runtime(): void
    {
        config(['services.railway.max_active_demos_per_user' => 1]);
        [$project, $current] = $this->liveRuntime();
        $older = PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $project->user_id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'provider_project_id' => 'railway_project_old',
            'status' => PublishedProjectDeployment::STATUS_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'public_url' => 'https://runtime-old.up.railway.app',
            'hosted_at' => now()->subHour(),
        ]);

        app(RuntimeDemoLifecycleService::class)->enforceUserLimit($current);

        $this->assertSame(PublishedProjectDeployment::STATUS_LIVE, $current->fresh()->status);
        $this->assertSame(PublishedProjectDeployment::STATUS_STOPPED, $older->fresh()->status);
        $this->assertDatabaseHas('published_project_runtime_cleanups', [
            'provider_project_id' => 'railway_project_old',
            'reason' => 'user_limit',
        ]);
    }

    public function test_cleanup_command_deletes_provider_project(): void
    {
        config(['services.railway.api_token' => 'account-token']);
        Http::fake([
            'https://backboard.railway.com/graphql/v2' => Http::response([
                'data' => ['projectDelete' => true],
            ]),
        ]);
        PublishedProjectRuntimeCleanup::create([
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'provider_project_id' => 'railway_project_cleanup',
            'status' => 'pending',
            'next_attempt_at' => now(),
        ]);

        $this->artisan('vibyra:cleanup-runtime-demos')->assertSuccessful();

        $this->assertDatabaseHas('published_project_runtime_cleanups', [
            'provider_project_id' => 'railway_project_cleanup',
            'status' => 'completed',
            'attempts' => 1,
        ]);
    }

    private function liveRuntime(): array
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'runtime-lifecycle',
            'slug' => 'runtime-lifecycle',
            'title' => 'Runtime Lifecycle',
            'description' => 'Lifecycle test.',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);
        $deployment = PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'provider_project_id' => 'railway_project_1',
            'provider_service_id' => 'railway_service_1',
            'status' => PublishedProjectDeployment::STATUS_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
            'public_url' => 'https://runtime-lifecycle.up.railway.app',
            'hosted_at' => now(),
        ]);

        return [$project, $deployment];
    }
}
