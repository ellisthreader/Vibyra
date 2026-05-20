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

class VibyraProjectPreviewSecurityApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_project_preview_skips_source_only_vite_entry_in_web_root(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $projectPath = storage_path('app/testing-web-source-preview-project');
        $token = 'test-preview-token';
        $projectId = rtrim(strtr(base64_encode($projectPath), '+/', '-_'), '=');

        try {
            File::deleteDirectory($projectPath);
            File::ensureDirectoryExists($projectPath.'/web/src');
            File::put($projectPath.'/web/index.html', '<!doctype html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
            File::put($projectPath.'/web/src/main.tsx', 'console.log("source only");');
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
                    'name' => 'testing-web-source-preview-project',
                    'path' => $projectPath,
                    'stack' => 'Node / React',
                    'updated' => 'Now',
                    'source' => 'desktop',
                ]],
                'events' => [],
            ], JSON_PRETTY_PRINT));

            $response = $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/');

            $response->assertNotFound();
            $this->assertStringContainsString('No runnable preview found', $response->getContent());
            $this->assertStringNotContainsString('main.tsx', $response->getContent());
        } finally {
            File::deleteDirectory($projectPath);
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_project_preview_rejects_empty_project_paths_and_traversal(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $token = 'test-preview-token';

        try {
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
                'selectedProjectId' => 'empty-project',
                'latestPreview' => null,
                'projects' => [[
                    'id' => 'empty-project',
                    'name' => 'empty-project',
                    'path' => '',
                    'stack' => 'Project',
                    'updated' => 'Now',
                    'source' => 'desktop',
                ]],
                'events' => [],
            ], JSON_PRETTY_PRINT));

            $this->get('/preview/project/empty-project/'.rawurlencode($token).'/composer.json')
                ->assertNotFound()
                ->assertSee('Preview file missing', false);
            $this->get('/preview/project/empty-project/'.rawurlencode($token).'/..%2Fcomposer.json')
                ->assertNotFound()
                ->assertSee('Preview file missing', false);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_project_preview_supports_trusted_encoded_folder_ids_after_start_preview(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $projectPath = storage_path('app/testing-encoded-preview-project');
        $token = 'test-preview-token';
        $projectId = rtrim(strtr(base64_encode($projectPath), '+/', '-_'), '=');

        try {
            File::deleteDirectory($projectPath);
            File::ensureDirectoryExists($projectPath.'/assets');
            File::put($projectPath.'/index.html', '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
            File::put($projectPath.'/assets/app.js', 'console.log("encoded preview");');
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
                'selectedProjectId' => null,
                'latestPreview' => null,
                'projects' => [],
                'events' => [],
            ], JSON_PRETTY_PRINT));

            $start = $this->postJson('/preview/start', ['projectId' => $projectId], ['Authorization' => "Bearer {$token}"]);
            $start->assertOk()->assertJsonPath('preview.url', '/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/');

            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/')
                ->assertOk()
                ->assertSee('assets/app.js', false);
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
