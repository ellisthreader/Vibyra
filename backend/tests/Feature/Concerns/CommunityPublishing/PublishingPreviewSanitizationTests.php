<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use Illuminate\Support\Facades\Http; 


trait PublishingPreviewSanitizationTests
{
    public function test_common_preview_controls_are_sanitized_without_hard_denial(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Preview Controls',
            'email' => 'preview.controls@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'preview-controls',
            'title' => 'Preview Controls',
            'description' => 'A project with simple interactive controls.',
            'previewHtml' => '<!doctype html><html><body><button>Save</button><input placeholder="Name"><select><option>A</option></select></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<button>Save</button><input placeholder="Name">'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('safetyRating', 'safe');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")
            ->assertOk()
            ->assertSee('<button>Save</button>', false);
    }

    public function test_local_preview_script_tags_are_sanitized_without_hard_denial(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Preview Bundle',
            'email' => 'preview.bundle@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'preview-bundle',
            'title' => 'Preview Bundle',
            'description' => 'A project with normal bundled preview assets.',
            'previewHtml' => '<!doctype html><html><body><div id="root">App</div><script type="module" src="/assets/app.js"></script></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<div id="root">App</div><script type="module" src="/assets/app.js"></script>'],
                ['path' => 'src/App.tsx', 'language' => 'tsx', 'body' => 'export function App() { return <div>App</div>; }'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('safetyRating', 'safe')
            ->assertJsonPath('safetyScore', 100);

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")
            ->assertOk()
            ->assertDontSee('<script', false)
            ->assertSee('App');
    }

    public function test_publish_rejects_private_media_hosts_and_secret_like_content(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Secret Publisher',
            'email' => 'secret.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'secret-project',
            'title' => 'Secret Portal',
            'description' => "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
            'logoImageUrl' => 'https://127.0.0.1/logo.png',
            'previewHtml' => '<!doctype html><html><body><h1>Secret</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED);

        $project = PublishedProject::where('source_project_id', 'secret-project')->firstOrFail();
        $codes = collect($project->review_flags)->pluck('code')->all();
        $this->assertContains('env_file', $codes);
        $this->assertContains('openai_key', $codes);
        $this->assertContains('private_image_host', $codes);
        Http::assertNothingSent();
    }
}
