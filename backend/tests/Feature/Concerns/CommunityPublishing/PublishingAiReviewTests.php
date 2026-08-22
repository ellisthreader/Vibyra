<?php

namespace Tests\Feature\Concerns\CommunityPublishing;
use App\Models\PublishedProject;
use App\Models\User;
use Illuminate\Support\Facades\Http; 


trait PublishingAiReviewTests
{
    public function test_ai_review_can_approve_low_score_under_review_project(): void
    {
        config([
            'moderation.publish_ai_review.enabled' => true,
            'moderation.publish_ai_review.max_score' => 90,
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openai.key' => 'test-openai-key',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [['flagged' => false, 'categories' => [], 'category_scores' => []]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => '{"decision":"approve","confidence":0.91,"score":83,"summary":"Low risk after AI review."}',
                    ],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'AI Approved',
            'email' => 'ai.approved@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'ai-approved',
            'title' => 'AI Approved',
            'description' => 'A project with an external API call.',
            'previewHtml' => '<!doctype html><html><body><h1>AI</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'src/api.ts', 'language' => 'ts', 'body' => 'export function ping() { return fetch("https://example.com/status"); }'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertCreated()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('safetyRating', 'low_risk')
            ->assertJsonPath('safetyScore', 83);

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions');
    }

    public function test_ai_review_can_deny_ambiguous_project_but_never_runs_for_hard_denials(): void
    {
        config([
            'moderation.publish_ai_review.enabled' => true,
            'moderation.publish_ai_review.max_score' => 90,
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openai.key' => 'test-openai-key',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [['flagged' => false, 'categories' => [], 'category_scores' => []]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => '{"decision":"deny","confidence":0.94,"score":18,"summary":"Dynamic code execution is unsafe."}',
                    ],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'AI Denied',
            'email' => 'ai.denied@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'ai-denied',
            'title' => 'AI Denied',
            'description' => 'A project with dynamic code execution.',
            'previewHtml' => '<!doctype html><html><body><h1>AI</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'src/run.js', 'language' => 'js', 'body' => 'export function run(userCode) { return eval(userCode); }'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED)
            ->assertJsonPath('safetyRating', 'blocked');

        Http::assertSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'hard-denied',
            'title' => 'Hard Denied',
            'description' => 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
            'previewHtml' => '<!doctype html><html><body><h1>Denied</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED);

        Http::assertSentCount(2);
    }

    public function test_ai_review_is_skipped_for_large_projects_to_control_cost(): void
    {
        config([
            'moderation.publish_ai_review.enabled' => true,
            'moderation.publish_ai_review.max_score' => 90,
            'moderation.publish_ai_review.max_source_files' => 2,
            'moderation.remote_enabled' => true,
            'moderation.publish_force_approve_under_review' => false,
            'services.openrouter.key' => 'test-openrouter-key',
            'services.openai.key' => 'test-openai-key',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [['flagged' => false, 'categories' => [], 'category_scores' => []]],
            ]),
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => [
                        'content' => '{"decision":"approve","confidence":0.99,"score":95,"summary":"Would approve."}',
                    ],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Large AI Skip',
            'email' => 'large.ai.skip@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'large-ai-skip',
            'title' => 'Large AI Skip',
            'description' => 'A large project with a small source warning.',
            'previewHtml' => '<!doctype html><html><body><h1>Large</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'src/one.ts', 'language' => 'ts', 'body' => 'fetch("https://example.com/one");'],
                ['path' => 'src/two.ts', 'language' => 'ts', 'body' => 'export const two = true;'],
                ['path' => 'src/three.ts', 'language' => 'ts', 'body' => 'export const three = true;'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('safetyRating', 'caution');

        $project = PublishedProject::where('source_project_id', 'large-ai-skip')->firstOrFail();
        $this->assertContains('ai_review_skipped_large_project', collect($project->review_flags)->pluck('code')->all());
        Http::assertNotSent(fn ($request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions');
    }
}
