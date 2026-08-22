<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\User;
use Illuminate\Support\Facades\Http; 


trait PublishingWorkflowTests
{
    public function test_user_can_publish_project_and_community_can_read_it(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex.community@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];
        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'project-123',
            'title' => 'Client Portal',
            'description' => 'A dashboard for client onboarding.',
            'stack' => 'React',
            'tags' => ['dashboard', 'clients'],
            'logoImageUrl' => 'data:image/png;base64,'.base64_encode('logo'),
            'screenshotUrls' => ['data:image/png;base64,'.base64_encode('screen')],
            'previewHtml' => '<!doctype html><html><body><h1>Portal</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Portal</h1></body></html>'],
                ['path' => 'src/App.tsx', 'language' => 'tsx', 'body' => 'export function App() { return <h1>Portal</h1>; }'],
            ],
            'sourceReview' => ['totalFiles' => 2, 'truncated' => false],
        ], $headers)
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('isPublic', true)
            ->assertJsonPath('safetyRating', 'safe')
            ->assertJsonPath('safetyScore', 100);

        $slug = $publish->json('project.id');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug)
            ->assertJsonPath('projects.0.title', 'Client Portal')
            ->assertJsonPath('projects.0.screenshots.0', 'Screenshot 1');

        $this->postJson("/api/community/projects/{$slug}/comments", [
            'text' => 'Looks useful.',
        ], $headers)->assertCreated()->assertJsonPath('comment.text', 'Looks useful.');

        $this->postJson("/api/community/projects/{$slug}/reaction", [], $headers)
            ->assertOk()
            ->assertJsonPath('liked', true)
            ->assertJsonPath('likes', 1);

        $this->get("/api/community/projects/{$slug}/preview")
            ->assertOk()
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertDontSee('<script>', false)
            ->assertSee('Portal');

        Http::assertSent(fn ($request) => collect($request['input'] ?? [])
            ->contains(fn ($item) => ($item['type'] ?? null) === 'image_url'));
    }

    public function test_public_publish_without_preview_payload_is_not_listed_as_openable_app(): void
    {
        $this->fakeCleanModeration();
        config(['moderation.publish_force_approve_under_review' => true]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'No Preview Publisher',
            'email' => 'no-preview.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'no-preview-project',
            'title' => 'No Preview Project',
            'description' => 'A folder that did not produce a hosted demo.',
            'stack' => 'Laravel',
            'sourceFiles' => [
                ['path' => 'routes/web.php', 'language' => 'php', 'body' => '<?php'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('hostedDemoStatus', 'unavailable');

        $user = User::where('email', 'no-preview.publisher@example.com')->firstOrFail();
        PublishedProject::create([
            'user_id' => $user->id,
            'source_project_id' => 'old-no-preview-project',
            'slug' => 'old-no-preview-project',
            'title' => 'Old No Preview Project',
            'description' => 'Previously approved without a captured demo.',
            'stack' => 'Laravel',
            'visibility' => 'public',
            'review_status' => PublishedProject::REVIEW_APPROVED,
            'published_at' => now(),
        ]);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');
    }

    public function test_publish_retries_do_not_hit_old_global_hourly_limit(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Retry Publisher',
            'email' => 'retry.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/projects/publish', [
                'projectId' => 'retry-project',
                'title' => 'Retry Project '.$i,
                'description' => 'A clean project publish retry.',
                'stack' => 'React',
                'previewHtml' => '<!doctype html><html><body><h1>Retry</h1></body></html>',
                'sourceFiles' => [
                    ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Retry</h1></body></html>'],
                ],
            ], $headers)->assertSuccessful();
        }
    }
}
