<?php

namespace Tests\Feature;

use App\Models\PublishedProject;
use App\Models\PublishedProjectComment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CommunityPublishingCoreTest extends TestCase
{
    use RefreshDatabase;

    protected function fakeCleanModeration(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response([
                'results' => [[
                    'flagged' => false,
                    'categories' => [],
                    'category_scores' => [],
                ]],
            ]),
        ]);
    }
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

    public function test_community_comment_route_rejects_banned_text_before_saving(): void
    {
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Comment Publisher',
            'email' => 'comment.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $headers = ['Authorization' => "Bearer {$token}"];
        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'comment-route-project',
            'title' => 'Comment Route Project',
            'description' => 'A clean app for comment route moderation.',
            'stack' => 'React',
            'previewHtml' => '<!doctype html><html><body><h1>Safe</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Safe</h1></body></html>'],
            ],
        ], $headers)->assertCreated();

        Http::fake();

        $this->postJson("/api/community/projects/{$publish->json('project.id')}/comments", [
            'text' => 'f.u.c.k this project',
        ], $headers)
            ->assertUnprocessable()
            ->assertJsonPath('moderation.blocked', true)
            ->assertJsonPath('moderation.reason', 'pattern');

        $this->assertSame(0, PublishedProjectComment::count());
        Http::assertNothingSent();
    }

    public function test_publish_with_unsafe_preview_is_denied_and_hidden(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Unsafe Publisher',
            'email' => 'unsafe.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'unsafe-preview',
            'title' => 'Unsafe Preview',
            'description' => 'A project with unsafe preview HTML.',
            'previewHtml' => '<!doctype html><html><body><script>alert(1)</script><h1>Bad</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED)
            ->assertJsonPath('safetyFindings.0.code', 'inline_script_content');

        $project = PublishedProject::where('source_project_id', 'unsafe-preview')->firstOrFail();
        $this->assertSame(PublishedProject::REVIEW_DENIED, $project->review_status);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$project->slug}/preview")->assertNotFound();
        Http::assertNothingSent();
    }

    public function test_publish_goes_under_review_when_remote_moderation_is_unavailable(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Manual Review',
            'email' => 'manual.review@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'manual-review',
            'title' => 'Pending Portal',
            'description' => 'A clean project that needs moderation service review.',
            'previewHtml' => '<!doctype html><html><body><h1>Pending</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Pending</h1></body></html>'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('safetyRating', 'needs_review')
            ->assertJsonPath('safetyScore', 82);

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")->assertNotFound();
    }

    public function test_publish_reviews_source_files_for_rating_and_secrets(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Source Reviewer',
            'email' => 'source.reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'source-secret',
            'title' => 'Source Secret',
            'description' => 'A project with a leaked source secret.',
            'previewHtml' => '<!doctype html><html><body><h1>Source</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'src/config.ts', 'language' => 'ts', 'body' => 'export const key = "sk-abcdefghijklmnopqrstuvwxyz123456";'],
            ],
        ], ['Authorization' => "Bearer {$token}"])
            ->assertUnprocessable()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_DENIED)
            ->assertJsonPath('safetyRating', 'blocked');

        $project = PublishedProject::where('source_project_id', 'source-secret')->firstOrFail();
        $this->assertContains('openai_key', collect($project->review_flags)->pluck('code')->all());
        $this->assertSame('blocked', $project->safety_rating);
    }

    public function test_deterministic_review_scores_source_risk_patterns(): void
    {
        config(['moderation.publish_ai_review.enabled' => false]);
        $this->fakeCleanModeration();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Risk Patterns',
            'email' => 'risk.patterns@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $cases = [
            ['external-api', 'src/api.ts', 'fetch("https://example.com/collect", { method: "POST" });', 'untrusted_network_endpoint', 86, 'caution'],
            ['camera-api', 'src/camera.ts', 'navigator.mediaDevices.getUserMedia({ video: true });', 'sensitive_browser_api', 88, 'caution'],
            ['install-script', 'package.json', '{"scripts":{"postinstall":"node setup.js"}}', 'dependency_install_script', 84, 'caution'],
            ['encoded-blob', 'src/blob.js', 'const data = "'.str_repeat('A', 3200).'";', 'minified_large_blob', 76, 'caution'],
            ['destructive-op', 'src/cleanup.js', 'import fs from "fs"; fs.rmSync("/tmp/cache", { recursive: true });', 'destructive_file_operation', 66, 'needs_review'],
        ];

        foreach ($cases as [$projectId, $path, $body, $code, $score, $rating]) {
            $this->postJson('/api/projects/publish', [
                'projectId' => $projectId,
                'title' => 'Risk '.$projectId,
                'description' => 'A project with a deterministic source risk.',
                'previewHtml' => '<!doctype html><html><body><h1>Risk</h1></body></html>',
                'sourceFiles' => [['path' => $path, 'language' => 'js', 'body' => $body]],
            ], ['Authorization' => "Bearer {$token}"])
                ->assertAccepted()
                ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
                ->assertJsonPath('safetyScore', $score)
                ->assertJsonPath('safetyRating', $rating);

            $project = PublishedProject::where('source_project_id', $projectId)->firstOrFail();
            $this->assertContains($code, collect($project->review_flags)->pluck('code')->all());
        }
    }

    public function test_missing_source_and_moderation_gap_is_not_labeled_high_risk(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Confidence Gap',
            'email' => 'confidence.gap@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $this->postJson('/api/projects/publish', [
            'projectId' => 'confidence-gap',
            'title' => 'Confidence Gap',
            'description' => 'A clean project where automated checks are incomplete.',
            'previewHtml' => '<!doctype html><html><body><h1>Gap</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('safetyRating', 'needs_review')
            ->assertJsonPath('safetyScore', 58);
    }

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

    public function test_ai_review_can_approve_low_score_under_review_project(): void
    {
        config([
            'moderation.publish_ai_review.enabled' => true,
            'moderation.publish_ai_review.max_score' => 90,
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

    public function test_configured_reviewer_can_approve_under_review_project(): void
    {
        config([
            'moderation.publish_reviewer_emails' => ['reviewer@example.com'],
            'services.openai.key' => 'test-openai-key',
        ]);
        Http::fake([
            'https://api.openai.com/v1/moderations' => Http::response(['error' => ['message' => 'Unavailable']], 503),
        ]);

        $publisherToken = $this->postJson('/api/auth/signup', [
            'name' => 'Queue Publisher',
            'email' => 'queue.publisher@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');
        $reviewerToken = $this->postJson('/api/auth/signup', [
            'name' => 'Reviewer',
            'email' => 'reviewer@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'queue-project',
            'title' => 'Queue Project',
            'description' => 'A clean project waiting for review.',
            'previewHtml' => '<!doctype html><html><body><h1>Queue</h1></body></html>',
            'sourceFiles' => [
                ['path' => 'index.html', 'language' => 'html', 'body' => '<!doctype html><html><body><h1>Queue</h1></body></html>'],
            ],
        ], ['Authorization' => "Bearer {$publisherToken}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW);

        $slug = $publish->json('project.id');

        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$publisherToken}"])
            ->assertForbidden();
        $this->getJson('/api/projects/review-queue', ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk()
            ->assertJsonPath('projects.0.sourceProjectId', 'queue-project');

        $this->postJson("/api/projects/{$slug}/review", [
            'decision' => PublishedProject::REVIEW_APPROVED,
            'reason' => 'Looks safe after review.',
        ], ['Authorization' => "Bearer {$reviewerToken}"])
            ->assertOk()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_APPROVED)
            ->assertJsonPath('isPublic', true)
            ->assertJsonPath('publishStatus.safetyRating', 'caution');

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonPath('projects.0.id', $slug);
    }

    public function test_publish_goes_under_review_when_preview_html_is_too_large(): void
    {
        config(['services.openai.key' => 'test-openai-key']);
        Http::fake();

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Large Preview',
            'email' => 'large.preview@example.com',
            'password' => 'secret123',
        ])->assertCreated()->json('token');

        $publish = $this->postJson('/api/projects/publish', [
            'projectId' => 'large-preview',
            'title' => 'Large Preview',
            'description' => 'A clean project with a very large preview.',
            'previewHtml' => '<!doctype html><html><body><h1>'.str_repeat('A', 181000).'</h1></body></html>',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertAccepted()
            ->assertJsonPath('reviewStatus', PublishedProject::REVIEW_UNDER_REVIEW)
            ->assertJsonPath('isPublic', false)
            ->assertJsonPath('safetyFindings.0.code', 'preview_html_too_large');

        $project = PublishedProject::where('source_project_id', 'large-preview')->firstOrFail();
        $this->assertSame(PublishedProject::REVIEW_UNDER_REVIEW, $project->review_status);
        $this->assertLessThanOrEqual(180000, strlen((string) $project->preview_html));

        $this->getJson('/api/community/projects')
            ->assertOk()
            ->assertJsonCount(0, 'projects');

        $this->get("/api/community/projects/{$publish->json('project.id')}/preview")->assertNotFound();
        Http::assertSent(fn ($request) => $request->url() === 'https://api.openai.com/v1/moderations');
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
