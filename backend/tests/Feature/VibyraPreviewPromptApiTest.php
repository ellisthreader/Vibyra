<?php

namespace Tests\Feature;

use App\Services\VibyraDesktopState;
use App\Services\Referrals\ReferralService;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use GuzzleHttp\Client as GuzzleClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Tests\TestCase;

class VibyraPreviewPromptApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_explicit_backend_setup_can_still_mention_localhost(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Start the backend, then open http://127.0.0.1:8000/api/skills to verify it.'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-backend@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'mode' => 'chat',
            'model' => 'gpt-5.4-mini',
            'project' => 'Vibyra',
            'prompt' => 'How do I check the backend setup locally?',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('reply', 'Start the backend, then open http://127.0.0.1:8000/api/skills to verify it.');
    }

    public function test_preview_change_prompt_uses_build_mode(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => '<vibyra-app title="Updated Preview"><!doctype html><html><body>Updated</body></html></vibyra-app>'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-preview@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'model' => 'gpt-5.4-mini',
            'project' => 'Preview Project',
            'prompt' => 'Make this change to the runnable preview: make the button red',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('app.title', 'Updated Preview');

        Http::assertSent(function ($request) {
            return $request['max_completion_tokens'] === 3000
                && str_contains($request['messages'][0]['content'], 'Return only the <vibyra-app> block.');
        });
    }

    public function test_build_preview_rejects_unbundled_local_script_entry(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => '<vibyra-app title="Broken"><!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html></vibyra-app>'],
                ]],
            ]),
        ]);

        $token = $this->postJson('/api/auth/signup', [
            'name' => 'Alex Carter',
            'email' => 'alex-invalid-preview@example.com',
            'password' => 'secret123',
        ])->json('token');

        $this->postJson('/api/chat', [
            'mode' => 'build',
            'model' => 'gpt-5.4-mini',
            'project' => 'Broken Preview',
            'prompt' => 'Create a React preview',
        ], ['Authorization' => "Bearer {$token}"])
            ->assertOk()
            ->assertJsonPath('app', null)
            ->assertJsonPath('reply', 'I could not attach a runnable phone preview because it referenced an unbundled local script (`/src/main.jsx`). Ask me to rebuild it as one self-contained HTML preview.');
    }

    public function test_project_preview_rewrites_nested_entry_assets_to_entry_root(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $projectPath = storage_path('app/testing-preview-project');
        $token = 'test-preview-token';
        $projectId = rtrim(strtr(base64_encode($projectPath), '+/', '-_'), '=');

        try {
            File::deleteDirectory($projectPath);
            File::ensureDirectoryExists($projectPath.'/dist/assets');
            File::put($projectPath.'/dist/index.html', '<!doctype html><html><head><link href="./style.css?v=1#sheet" rel="stylesheet"></head><body><script src="/assets/app.js?v=2"></script></body></html>');
            File::put($projectPath.'/dist/assets/app.js', 'console.log("preview asset");');
            File::put($projectPath.'/dist/style.css', implode("\n", [
                '@import "/reset.css";',
                'body { background-image: url("/assets/bg.png?v=3#hero"); color: red; }',
                ".icon { background: url('./assets/icon.svg'); }",
                ".external { background: url('//cdn.example.com/image.png'); }",
            ]));
            File::put($projectPath.'/dist/reset.css', 'html { min-height: 100%; }');
            File::put($projectPath.'/dist/assets/bg.png', 'png');
            File::put($projectPath.'/dist/assets/icon.svg', '<svg></svg>');
            File::ensureDirectoryExists(dirname($statePath));
            File::put($statePath, json_encode([
                'machineName' => 'Test Desktop',
                'pairCode' => 'ABC123',
                'token' => $token,
                'startedAt' => now()->toISOString(),
                'pairedDevice' => 'Test Phone',
                'pendingPair' => null,
                'activeAgentRun' => null,
                'pendingAgentApplies' => [],
                'selectedProjectId' => $projectId,
                'latestPreview' => null,
                'projects' => [[
                    'id' => $projectId,
                    'name' => 'testing-preview-project',
                    'path' => $projectPath,
                    'stack' => 'Node / React',
                    'updated' => 'Now',
                    'source' => 'desktop',
                ]],
                'events' => [],
            ], JSON_PRETTY_PRINT));

            $response = $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/');

            $response->assertOk();
            $body = $response->getContent();
            $base = '/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/';
            $this->assertStringContainsString('src="'.$base.'dist/assets/app.js?v=2"', $body);
            $this->assertStringContainsString('href="'.$base.'dist/style.css?v=1#sheet"', $body);

            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/dist/assets/app.js')
                ->assertOk()
                ->assertSee('console.log("preview asset");', false);

            $css = $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/dist/style.css?v=1');
            $css->assertOk();
            $this->assertStringContainsString('@import "'.$base.'dist/reset.css"', $css->getContent());
            $this->assertStringContainsString('url("'.$base.'dist/assets/bg.png?v=3#hero")', $css->getContent());
            $this->assertStringContainsString("url('./assets/icon.svg')", $css->getContent());
            $this->assertStringContainsString("url('//cdn.example.com/image.png')", $css->getContent());
        } finally {
            File::deleteDirectory($projectPath);
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }
}
