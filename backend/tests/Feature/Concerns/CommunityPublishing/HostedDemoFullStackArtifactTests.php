<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment; 


trait HostedDemoFullStackArtifactTests
{
    public function test_fastapi_full_stack_bundle_keeps_built_frontend_files(): void
    {
        $this->fakeCleanModeration();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'FastAPI Full Stack',
            'email' => 'fastapi.fullstack@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'fastapi-full-stack',
            'title' => 'FastAPI Full Stack',
            'description' => 'A FastAPI API with a built Vite frontend.',
            'stack' => 'FastAPI + React',
            'sourceFiles' => [
                ['path' => 'backend/app/main.py', 'language' => 'python', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'buildCommand' => 'pip install -r requirements.txt',
                'startCommand' => 'python -m uvicorn _vibyra_runtime:app --host 0.0.0.0 --port ${PORT}',
                'metadata' => ['frontendDistDirectory' => 'frontend/dist'],
                'files' => [
                    ['path' => 'requirements.txt', 'encoding' => 'utf8', 'body' => "fastapi==0.115.0\nuvicorn==0.34.0\n"],
                    ['path' => 'backend/app/main.py', 'encoding' => 'utf8', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
                    ['path' => '_vibyra_runtime.py', 'encoding' => 'utf8', 'body' => "from backend.app.main import app\n"],
                    ['path' => 'frontend/dist/index.html', 'encoding' => 'utf8', 'body' => '<!doctype html><script src="/assets/app.js"></script>'],
                    ['path' => 'frontend/dist/assets/app.js', 'encoding' => 'utf8', 'body' => "fetch('/health');"],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.frontendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendStatus', 'pending');

        $deployment = PublishedProjectDeployment::where(
            'published_project_id',
            PublishedProject::where('slug', $publish->json('project.id'))->value('id')
        )->firstOrFail();

        $this->assertSame('frontend/dist', $deployment->metadata['frontendDistDirectory'] ?? null);
        $this->assertContains('frontend/dist/index.html', collect($deployment->demo_files)->pluck('path')->all());
        $this->assertContains('frontend/dist/assets/app.js', collect($deployment->demo_files)->pluck('path')->all());
    }

    public function test_generated_full_stack_assets_are_not_scanned_as_source_code(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Generated Asset Review',
            'email' => 'generated.asset.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'generated-full-stack-assets',
            'title' => 'Generated Full-stack Assets',
            'description' => 'A clean FastAPI and React project.',
            'stack' => 'React + FastAPI',
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'startCommand' => 'python -m uvicorn _vibyra_runtime:app --host 0.0.0.0 --port ${PORT}',
                'metadata' => ['frontendDistDirectory' => 'frontend/dist'],
                'files' => [
                    ['path' => 'requirements.txt', 'encoding' => 'utf8', 'body' => "fastapi\nuvicorn\n"],
                    ['path' => '_vibyra_runtime.py', 'encoding' => 'utf8', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
                    ['path' => 'ml/generate_data.py', 'encoding' => 'utf8', 'body' => 'label = "payment query needs resolution this week"'],
                    ['path' => 'frontend/dist/index.html', 'encoding' => 'utf8', 'body' => '<script src="/assets/app.js"></script>'],
                    ['path' => 'frontend/dist/assets/app.js', 'encoding' => 'utf8', 'body' => 'eval("compiled framework helper")'],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonMissing(['code' => 'dynamic_code_execution'])
            ->assertJsonMissing(['code' => 'auth_payment_surface']);
    }
}
