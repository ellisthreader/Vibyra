<?php

namespace Tests\Feature;

use App\Jobs\DeployRuntimeDemoJob;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\TestCase;

class RuntimeDeploymentQueueTest extends TestCase
{
    use RefreshDatabase;

    public function test_queue_mode_dispatches_to_the_dedicated_queue_without_changing_status(): void
    {
        Queue::fake();
        config(['runtime_deployments.queue_enabled' => true]);
        $deployment = $this->queuedDeployment();

        $this->artisan('vibyra:deploy-runtime-demos')->assertSuccessful();

        Queue::assertPushed(DeployRuntimeDemoJob::class, fn ($job) => (
            $job->deploymentId === $deployment->id && $job->queue === 'deployments'
        ));
        $this->assertSame(PublishedProjectDeployment::STATUS_QUEUED, $deployment->fresh()->status);
    }

    public function test_failed_worker_marks_incomplete_deployment_failed(): void
    {
        $deployment = $this->queuedDeployment();

        (new DeployRuntimeDemoJob($deployment->id))->failed(new RuntimeException('Worker stopped.'));

        $this->assertSame(PublishedProjectDeployment::STATUS_FAILED, $deployment->fresh()->status);
        $this->assertSame('queue_failed', $deployment->fresh()->provider_status);
    }

    private function queuedDeployment(): PublishedProjectDeployment
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'queued-runtime',
            'slug' => 'queued-runtime',
            'title' => 'Queued Runtime',
            'description' => 'Queue contract.',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        return PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_QUEUED,
            'hosting_mode' => PublishedProjectDeployment::MODE_RAILWAY,
        ]);
    }
}
