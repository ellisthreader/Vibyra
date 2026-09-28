<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use App\Services\Deployments\DeploymentArtifactStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class DeploymentArtifactStoreTest extends TestCase
{
    use RefreshDatabase;

    public function test_dual_mode_keeps_inline_rollback_data_and_records_a_verified_object(): void
    {
        $deployment = $this->deployment();
        $this->configureStore('dual');

        $this->assertTrue(app(DeploymentArtifactStore::class)->persist($deployment));

        $fresh = $deployment->fresh();
        Storage::disk('artifacts')->assertExists($fresh->artifact_path);
        $this->assertNotEmpty($fresh->demo_files);
        $this->assertSame(
            $fresh->artifact_sha256,
            hash('sha256', Storage::disk('artifacts')->get($fresh->artifact_path))
        );
    }

    public function test_object_mode_hydrates_artifacts_for_existing_preview_routes(): void
    {
        $deployment = $this->deployment();
        $this->configureStore('object');
        app(DeploymentArtifactStore::class)->persist($deployment);

        $fresh = $deployment->fresh();
        $this->assertNull($fresh->demo_files);

        $this->get('/api/community/projects/artifact-store/demo/index.html')
            ->assertOk()
            ->assertSee('Stored outside the database', false);
    }

    public function test_object_mode_fails_closed_when_checksum_validation_fails(): void
    {
        $deployment = $this->deployment();
        $this->configureStore('object');
        app(DeploymentArtifactStore::class)->persist($deployment);
        $fresh = $deployment->fresh();
        Storage::disk('artifacts')->put($fresh->artifact_path, '{"tampered":true}');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('checksum');
        app(DeploymentArtifactStore::class)->files($fresh);
    }

    public function test_backfill_requires_dual_mode_and_records_existing_artifacts(): void
    {
        $deployment = $this->deployment();
        Storage::fake('artifacts');
        config([
            'deployment_artifacts.mode' => 'database',
            'deployment_artifacts.disk' => 'artifacts',
        ]);
        $this->artisan('vibyra:backfill-deployment-artifacts')->assertFailed();

        config(['deployment_artifacts.mode' => 'dual']);
        $this->artisan('vibyra:backfill-deployment-artifacts')->assertSuccessful();

        $fresh = $deployment->fresh();
        $this->assertNotNull($fresh->artifact_path);
        $this->assertNotEmpty($fresh->demo_files);
        Storage::disk('artifacts')->assertExists($fresh->artifact_path);
    }

    private function configureStore(string $mode): void
    {
        Storage::fake('artifacts');
        config([
            'deployment_artifacts.mode' => $mode,
            'deployment_artifacts.disk' => 'artifacts',
            'deployment_artifacts.prefix' => 'deployments',
        ]);
    }

    private function deployment(): PublishedProjectDeployment
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'artifact-store',
            'slug' => 'artifact-store',
            'title' => 'Artifact Store',
            'description' => 'Object storage compatibility.',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        return PublishedProjectDeployment::create([
            'published_project_id' => $project->id,
            'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'hosting_mode' => PublishedProjectDeployment::MODE_STATIC,
            'entry_path' => 'index.html',
            'demo_files' => [[
                'path' => 'index.html',
                'contentType' => 'text/html',
                'encoding' => 'utf8',
                'body' => '<h1>Stored outside the database</h1>',
            ]],
            'hosted_at' => now(),
        ]);
    }
}
