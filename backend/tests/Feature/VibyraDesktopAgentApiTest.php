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

class VibyraDesktopAgentApiTest extends TestCase
{
    use RefreshDatabase;
    public function test_desktop_agent_does_not_fall_back_to_first_project_for_unknown_project_id(): void
    {
        config(['services.openrouter.key' => 'test-openrouter-key']);
        Http::fake([
            'https://openrouter.ai/api/v1/chat/completions' => Http::response([
                'choices' => [[
                    'message' => ['content' => 'Should not run.'],
                ]],
            ]),
        ]);

        $desktopState = app(VibyraDesktopState::class)->state();

        $this->postJson('/agents/start', [
            'projectId' => 'missing-project-id',
            'prompt' => 'Build a landing page',
            'model' => 'gpt-5.5',
            'reasoningEffort' => 'medium',
        ], ['Authorization' => 'Bearer '.$desktopState['token']])
            ->assertUnprocessable()
            ->assertJsonPath('error', 'No project selected');

        Http::assertNothingSent();
    }

    public function test_desktop_agent_recovers_stale_active_run_before_rejecting(): void
    {
        config(['services.openrouter.key' => '']);

        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $state = app(VibyraDesktopState::class)->state();
        $project = $state['projects'][0];
        $oldTimestamp = now()->subMinutes(10)->toISOString();
        $state['activeAgentRun'] = [
            'id' => 'run-stale',
            'projectId' => $project['id'],
            'model' => 'gpt-5.5',
            'title' => 'Old stuck run',
            'progress' => 65,
            'state' => 'running',
            'file' => 'OpenRouter stream',
            'startedAt' => $oldTimestamp,
            'updatedAt' => $oldTimestamp,
        ];
        $state['lastPromptCompletedAt'] = $oldTimestamp;

        try {
            File::put($statePath, json_encode($state, JSON_PRETTY_PRINT));

            $this->postJson('/agents/start', [
                'projectId' => $project['id'],
                'prompt' => 'Build a landing page',
                'model' => 'gpt-5.5',
                'reasoningEffort' => 'medium',
            ], ['Authorization' => 'Bearer '.$state['token']])
                ->assertUnprocessable()
                ->assertJsonPath('error', 'OPENROUTER_API_KEY is not configured on the desktop backend');

            $updatedState = json_decode(File::get($statePath), true);
            $this->assertNull($updatedState['activeAgentRun']);
            $this->assertSame('Cleared stale desktop AI run state', $updatedState['events'][0]['message']);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_desktop_agent_recovers_active_run_with_missing_timestamps(): void
    {
        config(['services.openrouter.key' => '']);

        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $state = app(VibyraDesktopState::class)->state();
        $project = $state['projects'][0];
        $state['activeAgentRun'] = [
            'id' => 'run-stuck',
            'projectId' => $project['id'],
            'model' => 'gpt-5.5',
            'title' => 'Stuck run without timestamps',
            'progress' => 65,
            'state' => 'running',
            'file' => 'OpenRouter stream',
        ];

        try {
            File::put($statePath, json_encode($state, JSON_PRETTY_PRINT));

            $this->postJson('/agents/start', [
                'projectId' => $project['id'],
                'prompt' => 'Build a landing page',
                'model' => 'gpt-5.5',
                'reasoningEffort' => 'medium',
            ], ['Authorization' => 'Bearer '.$state['token']])
                ->assertUnprocessable()
                ->assertJsonPath('error', 'OPENROUTER_API_KEY is not configured on the desktop backend');

            $updatedState = json_decode(File::get($statePath), true);
            $this->assertNull($updatedState['activeAgentRun']);
            $this->assertSame('Cleared stale desktop AI run state', $updatedState['events'][0]['message']);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }

    public function test_desktop_agent_busy_response_includes_active_run_context(): void
    {
        $statePath = storage_path('app/vibyra/state.json');
        $originalState = File::exists($statePath) ? File::get($statePath) : null;
        $state = app(VibyraDesktopState::class)->state();
        $project = $state['projects'][0];
        $startedAt = now()->subSeconds(45)->toISOString();
        $state['activeAgentRun'] = [
            'id' => 'run-visible',
            'projectId' => $project['id'],
            'model' => 'gpt-5.4-mini',
            'title' => 'make zombie game',
            'progress' => 42,
            'state' => 'running',
            'file' => 'OpenRouter stream',
            'startedAt' => $startedAt,
            'updatedAt' => $startedAt,
        ];

        try {
            File::put($statePath, json_encode($state, JSON_PRETTY_PRINT));

            $this->postJson('/agents/start', [
                'projectId' => $project['id'],
                'prompt' => 'Build a landing page',
                'model' => 'gpt-5.5',
                'reasoningEffort' => 'medium',
            ], ['Authorization' => 'Bearer '.$state['token']])
                ->assertStatus(429)
                ->assertJsonPath('busyReason', 'active-run')
                ->assertJsonPath('activeAgentRun.title', 'make zombie game')
                ->assertJsonPath('activeAgentRun.projectName', $project['name'])
                ->assertJsonPath('activeAgentRun.progress', 42);
        } finally {
            if ($originalState === null) {
                File::delete($statePath);
            } else {
                File::put($statePath, $originalState);
            }
        }
    }
}
