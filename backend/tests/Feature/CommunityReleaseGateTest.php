<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\SecurityRoleAssignment;
use App\Models\User;
use App\Models\VibyraSession;
use App\Services\Auth\PrivilegedRoleService;
use App\Contracts\RuntimeDeploymentProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CommunityReleaseGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['legal.community_enabled' => false, 'legal.enforce_market_access' => false]);
    }

    public function test_default_off_rejects_creation_before_provider_calls_or_writes(): void
    {
        $user = User::factory()->create();
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id, 'token_hash' => hash('sha256', $token),
            'device_name' => 'Gate test', 'last_used_at' => now(),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay(),
        ]);
        $this->withHeaders(['Authorization' => 'Bearer '.$token]);
        foreach (['/api/projects/publish', '/api/community/projects/any/comments',
            '/api/community/projects/any/reaction', '/api/community/assets/generate'] as $url) {
            $response = $this->postJson($url)->assertStatus(503)
                ->assertJsonPath('code', 'community_unavailable');
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        }
        $this->patchJson('/api/projects/any/listing')->assertStatus(503);
        $this->assertDatabaseCount('published_projects', 0);
    }

    public function test_existing_content_can_be_reported_hidden_and_deleted_while_off(): void
    {
        $user = User::factory()->create();
        $token = Str::random(72);
        VibyraSession::create([
            'user_id' => $user->id, 'token_hash' => hash('sha256', $token),
            'device_name' => 'Test phone', 'last_used_at' => now(),
            'idle_expires_at' => now()->addHour(), 'absolute_expires_at' => now()->addDay(),
        ]);
        $project = PublishedProject::create([
            'user_id' => $user->id, 'source_project_id' => 'source-gate', 'slug' => 'gate-project',
            'title' => 'Gate project', 'description' => 'Existing content',
            'preview_html' => '<!doctype html><html><body>Reportable</body></html>',
            'visibility' => 'public', 'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);
        PublishedProjectDeployment::create([
            'published_project_id' => $project->id, 'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_STATIC,
            'status' => PublishedProjectDeployment::STATUS_STATIC_LIVE,
            'entry_path' => 'index.html',
            'demo_files' => [['path' => 'index.html', 'contentType' => 'text/html', 'body' => '<h1>Published demo</h1>']],
        ]);
        $headers = ['Authorization' => 'Bearer '.$token];
        $this->getJson('/api/community/projects')->assertOk()->assertJsonCount(1, 'projects');
        $this->get('/api/community/projects/gate-project/preview')->assertOk()
            ->assertSee('Reportable');
        $this->get('/api/community/projects/gate-project/demo/index.html')->assertOk()
            ->assertSee('Published demo');
        $this->deleteJson('/api/community/projects/gate-project/reaction', [], $headers)->assertOk();

        $this->postJson('/api/community/projects/gate-project/reports', [
            'reason' => 'broken_app',
        ], $headers)->assertCreated();
        app(PrivilegedRoleService::class)->grant($user, SecurityRoleAssignment::ROLE_REVIEWER);
        $this->postJson('/api/projects/gate-project/review', ['decision' => 'denied'], $headers)
            ->assertOk()->assertJsonPath('reviewStatus', 'denied');
        $this->postJson('/api/projects/gate-project/review', ['decision' => 'approved'], $headers)
            ->assertStatus(503)->assertJsonPath('code', 'community_unavailable');
        $this->assertDatabaseHas('published_projects', ['slug' => 'gate-project', 'review_status' => 'denied']);
        $this->getJson('/api/projects/publish-status', $headers)->assertOk();
        $this->patchJson('/api/projects/gate-project/publish', ['visibility' => 'public'], $headers)
            ->assertStatus(503)->assertJsonPath('code', 'community_unavailable');
        $this->patchJson('/api/projects/gate-project/publish', ['visibility' => 'unlisted'], $headers)
            ->assertStatus(503);
        $this->patchJson('/api/projects/gate-project/publish', ['visibility' => 'private'], $headers)
            ->assertOk()->assertJsonPath('publishStatus.visibility', 'private');
        $this->deleteJson('/api/projects/gate-project/publish', [], $headers)->assertOk();
    }

    public function test_queued_runtime_demo_cannot_deploy_after_community_is_disabled(): void
    {
        $user = User::factory()->create();
        $project = PublishedProject::create([
            'user_id' => $user->id, 'source_project_id' => 'queued-source', 'slug' => 'queued-demo',
            'title' => 'Queued demo', 'description' => 'Not released',
            'visibility' => 'public', 'review_status' => PublishedProject::REVIEW_APPROVED,
        ]);
        $deployment = PublishedProjectDeployment::create([
            'published_project_id' => $project->id, 'user_id' => $user->id,
            'provider' => PublishedProjectDeployment::PROVIDER_RAILWAY,
            'status' => PublishedProjectDeployment::STATUS_QUEUED,
        ]);

        $this->artisan('vibyra:deploy-runtime-demos')
            ->expectsOutput('Community sharing is disabled; runtime demos will not deploy.')
            ->assertExitCode(0);
        $this->assertSame(PublishedProjectDeployment::STATUS_QUEUED, $deployment->fresh()->status);
        app(RuntimeDeploymentProvider::class)->deploy($deployment);
        $this->assertSame(PublishedProjectDeployment::STATUS_STOPPED, $deployment->fresh()->status);
    }

    public function test_default_off_closes_public_community_and_publishing_routes(): void
    {
        $status = $this->getJson('/api/community/status')->assertOk()
            ->assertJsonPath('communityEnabled', false);
        $this->assertStringContainsString('no-store', (string) $status->headers->get('Cache-Control'));

        foreach (['/api/community/projects', '/api/community/projects/any/preview',
            '/api/community/projects/any/demo/index.html'] as $url) {
            $response = $this->getJson($url)->assertStatus(503)
                ->assertJsonPath('code', 'community_unavailable');
            $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        }
        foreach (['/api/projects/publish', '/api/community/projects/any/comments',
            '/api/community/projects/any/reaction', '/api/community/assets/generate'] as $url) {
            $this->postJson($url)->assertStatus(503)->assertJsonPath('code', 'community_unavailable');
        }
        $this->patchJson('/api/projects/any/listing')->assertStatus(503);
        $this->get('/legal/community')->assertOk();
    }

    public function test_explicit_release_restores_listing_and_status(): void
    {
        config(['legal.community_enabled' => true]);
        $this->getJson('/api/community/status')->assertJsonPath('communityEnabled', true);
        $this->getJson('/api/community/projects')->assertOk()->assertJsonCount(0, 'projects');
    }

    public function test_status_stays_accessible_outside_launch_market(): void
    {
        config(['legal.enforce_market_access' => true]);
        $this->withServerVariables(['REMOTE_ADDR' => '1.2.3.4'])
            ->getJson('/api/community/status')->assertOk()->assertJsonPath('communityEnabled', false);
    }

}
