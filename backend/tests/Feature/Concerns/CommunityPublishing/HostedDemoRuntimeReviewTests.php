<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\PublishedProjectDeployment;
use App\Models\User;
use Illuminate\Support\Facades\Http; 


trait HostedDemoRuntimeReviewTests
{
    public function test_runtime_bundle_is_reviewed_and_preserved_until_manual_approval(): void
    {
        config([
            'services.openai.key' => 'test-openai-key',
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $publisherToken = $this->postJson('/api/auth/signup', [
            'name' => 'Pending Runtime',
            'email' => 'pending.runtime@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $reviewerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Reviewer',
            'email' => 'reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        User::where('email', 'reviewer@example.com')->firstOrFail()->markEmailAsVerified();

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'pending-runtime',
            'title' => 'Pending Runtime',
            'description' => 'A clean runtime waiting for review.',
            'stack' => 'Express',
            'sourceFiles' => [['path' => 'safe.txt', 'language' => 'text', 'body' => 'safe']],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'startCommand' => 'npm run start',
                'files' => [
                    ['path' => 'package.json', 'encoding' => 'utf8', 'body' => '{"scripts":{"start":"node server.js"},"dependencies":{"express":"latest"}}'],
                    ['path' => 'server.js', 'encoding' => 'utf8', 'body' => "import express from 'express';"],
                ],
            ],
        ], ['Authorization' => "Bearer {$publisherToken}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW);

        $project = PublishedProject::where('slug', $publish->json('project.id'))->firstOrFail();
        $deployment = PublishedProjectDeployment::where('published_project_id', $project->id)->firstOrFail();
        $this->assertSame(PublishedProjectDeployment::STATUS_PENDING_REVIEW, $deployment->status);
        $this->assertCount(2, $deployment->demo_files);

        $this->postJson("/api/projects/{$project->slug}/review", [
            'decision' => PublishedProject::REVIEW_APPROVED,
        ], ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED);

        $this->assertSame(
            PublishedProjectDeployment::STATUS_QUEUED,
            $deployment->fresh()->status
        );
    }

    public function test_runtime_files_cannot_bypass_source_review(): void
    {
        $this->fakeCleanModeration();
        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Runtime Review',
            'email' => 'runtime.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'runtime-review',
            'title' => 'Runtime Review',
            'description' => 'The submitted source looks safe.',
            'stack' => 'Express',
            'sourceFiles' => [['path' => 'safe.txt', 'language' => 'text', 'body' => 'safe']],
            'runtimeBundle' => [
                'ok' => true,
                'platform' => 'node',
                'startCommand' => 'npm run start',
                'files' => [
                    ['path' => 'package.json', 'encoding' => 'utf8', 'body' => '{"scripts":{"start":"node server.js"}}'],
                    ['path' => 'server.js', 'encoding' => 'utf8', 'body' => 'const key = "sk-abcdefghijklmnopqrstuvwxyz123456";'],
                ],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED);
    }
}
