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

class VibyraProjectPreviewStaticApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_project_preview_keeps_root_entry_absolute_assets_at_project_root(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $projectPath = storage_path('app/testing-root-preview-project');
        $token = 'test-preview-token';
        $projectId = rtrim(strtr(base64_encode($projectPath), '+/', '-_'), '=');

        try {
            File::deleteDirectory($projectPath);
            File::ensureDirectoryExists($projectPath.'/assets');
            File::put($projectPath.'/index.html', '<!doctype html><html><body><script src="/assets/app.js"></script></body></html>');
            File::put($projectPath.'/assets/app.js', 'console.log("root preview asset");');
            File::put($projectPath.'/module.wasm', 'wasm');
            File::put($projectPath.'/favicon.ico', 'ico');
            File::put($projectPath.'/site.webmanifest', '{}');
            File::put($projectPath.'/app.js.map', '{}');
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
                    'name' => 'testing-root-preview-project',
                    'path' => $projectPath,
                    'stack' => 'HTML',
                    'updated' => 'Now',
                    'source' => 'desktop',
                ]],
                'events' => [],
            ], JSON_PRETTY_PRINT));

            $response = $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/');

            $response->assertOk();
            $base = '/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/';
            $this->assertStringContainsString('src="'.$base.'assets/app.js"', $response->getContent());

            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/assets/app.js')
                ->assertOk()
                ->assertSee('console.log("root preview asset");', false);

            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/module.wasm')
                ->assertOk()
                ->assertHeader('Content-Type', 'application/wasm');
            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/favicon.ico')
                ->assertOk()
                ->assertHeader('Content-Type', 'image/x-icon');
            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/site.webmanifest')
                ->assertOk()
                ->assertHeader('Content-Type', 'application/manifest+json; charset=UTF-8');
            $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/app.js.map')
                ->assertOk()
                ->assertHeader('Content-Type', 'application/json; charset=UTF-8');
        } finally {
            File::deleteDirectory($projectPath);
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_project_preview_skips_source_only_vite_root_entry(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $projectPath = storage_path('app/testing-source-preview-project');
        $token = 'test-preview-token';
        $projectId = rtrim(strtr(base64_encode($projectPath), '+/', '-_'), '=');

        try {
            File::deleteDirectory($projectPath);
            File::ensureDirectoryExists($projectPath.'/src');
            File::put($projectPath.'/index.html', '<!doctype html><html><body><script data-entry="app" type="module" src="/src/custom-entry.tsx"></script></body></html>');
            File::put($projectPath.'/src/custom-entry.tsx', 'console.log("source only");');
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
                    'name' => 'testing-source-preview-project',
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
            $this->assertStringNotContainsString('custom-entry', $response->getContent());
        } finally {
            File::deleteDirectory($projectPath);
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_project_preview_does_not_serve_stray_root_index_for_laravel_vite_projects(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $projectPath = storage_path('app/testing-laravel-static-preview-project');
        $token = 'test-preview-token';
        $projectId = rtrim(strtr(base64_encode($projectPath), '+/', '-_'), '=');

        try {
            File::deleteDirectory($projectPath);
            File::ensureDirectoryExists($projectPath);
            File::put($projectPath.'/index.html', '<!doctype html><html><body>Generated placeholder menu</body></html>');
            File::put($projectPath.'/composer.json', json_encode(['require' => ['laravel/framework' => '^13.0']]));
            File::put($projectPath.'/package.json', json_encode([
                'scripts' => ['dev' => 'vite'],
                'devDependencies' => ['laravel-vite-plugin' => 'latest', 'vite' => 'latest'],
            ]));
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
                    'name' => 'testing-laravel-static-preview-project',
                    'path' => $projectPath,
                    'stack' => 'Laravel / React',
                    'updated' => 'Now',
                    'source' => 'desktop',
                ]],
                'events' => [],
            ], JSON_PRETTY_PRINT));

            $response = $this->get('/preview/project/'.rawurlencode($projectId).'/'.rawurlencode($token).'/');

            $response->assertNotFound();
            $this->assertStringContainsString('No runnable preview found', $response->getContent());
            $this->assertStringNotContainsString('Generated placeholder menu', $response->getContent());
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
