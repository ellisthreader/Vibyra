<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use Illuminate\Support\Facades\Http; 


trait HostedDemoPythonRuntimeTests
{
    public function test_python_runtime_bundle_creates_queued_railway_deployment(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Python Runtime',
            'email' => 'python.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'python-runtime',
            'title' => 'Python Runtime',
            'description' => 'A clean FastAPI backend.',
            'stack' => 'FastAPI',
            'sourceFiles' => [
                ['path' => 'requirements.txt', 'language' => 'text', 'body' => 'fastapi==0.115.0'],
                ['path' => 'app/main.py', 'language' => 'python', 'body' => "from fastapi import FastAPI\napp = FastAPI()\n"],
            ],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'buildCommand' => 'pip install -r requirements.txt',
                'startCommand' => 'python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}',
                'runtimeReason' => 'FastAPI backend detected.',
                'files' => [
                    [
                        'path' => 'requirements.txt',
                        'contentType' => 'text/plain; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => 'fastapi==0.115.0',
                    ],
                    [
                        'path' => 'app/main.py',
                        'contentType' => 'text/plain; charset=UTF-8',
                        'encoding' => 'utf8',
                        'body' => "from fastapi import FastAPI\napp = FastAPI()\n",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('publishStatus.backendStatus', 'pending')
            ->assertJsonPath('publishStatus.backendPlatform', 'python')
            ->assertJsonPath('publishStatus.frontendStatus', 'unavailable');

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();

        $this->assertSame('python', $deployment->metadata['platform'] ?? null);
        $this->assertSame('pip install -r requirements.txt', $deployment->build_command);
        $this->assertSame('python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}', $deployment->start_command);
    }

    public function test_python_server_source_may_declare_local_cors_origins(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Python Local CORS',
            'email' => 'python.local.cors@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'python-local-cors',
            'title' => 'Python Local CORS',
            'description' => 'Full stack Python project.',
            'stack' => 'React + FastAPI',
            'tags' => ['python'],
            'visibility' => 'public',
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'python',
                'startCommand' => 'python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}',
                'files' => [
                    [
                        'path' => 'requirements.txt',
                        'encoding' => 'utf8',
                        'body' => "fastapi\nuvicorn\n",
                    ],
                    [
                        'path' => 'backend/app/main.py',
                        'encoding' => 'utf8',
                        'body' => "origins = ['http://localhost:5173', 'http://127.0.0.1:5173']\n",
                    ],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])->assertCreated();
    }
}
