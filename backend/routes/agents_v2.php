<?php

use App\Http\Controllers\AgentsV2\{ComputerRunnerController, ConnectionFlowsController, ConnectionsController, RunnerController, RunsController, RuntimesController, SchedulesController, TriggersController};
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

/*
 * Agent V2: account-funded runs on the Mac's selected AI account. Contract:
 * docs/agent-v2-api-contract.md. Gated by AGENTS_V2_ENABLED + AGENTS_V2_USER_IDS.
 */
Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class])->group(function (): void {
    Route::middleware(['throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
        Route::post('runs', [RunsController::class, 'store'])->middleware('throttle:30,1,agent-v2-admit');
        Route::get('runs', [RunsController::class, 'index']);
        Route::get('runs/{id}', [RunsController::class, 'show'])->whereUuid('id');
        Route::get('runs/{id}/events', [RunsController::class, 'events'])->whereUuid('id');
        Route::get('runs/{id}/tools', [RunsController::class, 'tools'])->whereUuid('id');
        Route::post('runs/{id}/cancel', [RunsController::class, 'cancel'])->whereUuid('id');
        Route::post('actions/{id}/decision', [RunsController::class, 'decide'])->whereUuid('id');
        Route::get('connections', [ConnectionsController::class, 'index']);
        // "Add another account": OAuth start + its outcome, or a pasted token.
        Route::post('connections', [ConnectionFlowsController::class, 'store'])->middleware('throttle:10,1,agent-v2-connect');
        Route::post('connections/{provider}/start', [ConnectionFlowsController::class, 'start'])
            ->where('provider', '[a-z][a-z0-9_]{1,39}')->middleware('throttle:10,1,agent-v2-connect');
        Route::get('connections/flows/{flow}', [ConnectionFlowsController::class, 'flow'])->whereUuid('flow');
        Route::delete('connections/{id}', [ConnectionsController::class, 'destroy'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
        Route::get('agents/{agentId}/grants', [ConnectionsController::class, 'grants'])->whereUuid('agentId');
        Route::put('agents/{agentId}/grants/{connectionId}', [ConnectionsController::class, 'put'])
            ->whereUuid('agentId')->whereUuid('connectionId');
        Route::delete('agents/{agentId}/grants/{connectionId}', [ConnectionsController::class, 'revoke'])
            ->whereUuid('agentId')->whereUuid('connectionId')->withoutMiddleware(RequireApprovedMarket::class);
        // Phase 5: routines (schedules) and event triggers.
        Route::get('schedules', [SchedulesController::class, 'index']);
        Route::post('schedules', [SchedulesController::class, 'store'])->middleware('throttle:30,1,agent-v2-routine');
        Route::post('schedules/preview', [SchedulesController::class, 'preview']);
        Route::get('schedules/{id}', [SchedulesController::class, 'show'])->whereUuid('id');
        Route::patch('schedules/{id}', [SchedulesController::class, 'update'])->whereUuid('id');
        Route::post('schedules/{id}/pause', [SchedulesController::class, 'pause'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
        Route::delete('schedules/{id}', [SchedulesController::class, 'destroy'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
        Route::get('schedules/{id}/occurrences', [SchedulesController::class, 'occurrences'])->whereUuid('id');
        Route::get('triggers', [TriggersController::class, 'index']);
        Route::post('triggers', [TriggersController::class, 'store'])->middleware('throttle:30,1,agent-v2-routine');
        Route::get('triggers/{id}', [TriggersController::class, 'show'])->whereUuid('id');
        Route::patch('triggers/{id}', [TriggersController::class, 'update'])->whereUuid('id');
        Route::post('triggers/{id}/pause', [TriggersController::class, 'pause'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
        Route::delete('triggers/{id}', [TriggersController::class, 'destroy'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
        Route::get('triggers/{id}/events', [TriggersController::class, 'events'])->whereUuid('id');
        Route::get('capabilities', [TriggersController::class, 'capabilities']);
        Route::get('runtimes', [RuntimesController::class, 'index']);
        Route::post('runtimes', [RuntimesController::class, 'store'])->middleware('throttle:12,1,agent-v2-runtime');
        Route::delete('runtimes/{id}', [RuntimesController::class, 'destroy'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
    });
    Route::prefix('runner/{runtime}')->whereUuid('runtime')->middleware(['throttle:600,1,agent-v2-runner', AgentV2Credentials::class.':runner'])->group(function (): void {
        Route::post('claim', [RunnerController::class, 'claim']);
        Route::post('runs/{run}/heartbeat', [RunnerController::class, 'heartbeat'])->whereUuid('run');
        Route::post('runs/{run}/events', [RunnerController::class, 'events'])->whereUuid('run');
        Route::get('runs/{run}/tools', [RunnerController::class, 'tools'])->whereUuid('run');
        Route::post('runs/{run}/tools', [RunnerController::class, 'call'])->whereUuid('run');
        Route::get('runs/{run}/actions/{action}', [RunnerController::class, 'action'])->whereUuid('run')->whereUuid('action');
        Route::post('runs/{run}/complete', [RunnerController::class, 'complete'])->whereUuid('run');
        Route::post('runs/{run}/fail', [RunnerController::class, 'fail'])->whereUuid('run');
        // Phase 4: Mac computer actions (docs/agent-v2-api-contract.md §6c).
        Route::get('runs/{run}/computer', [ComputerRunnerController::class, 'index'])->whereUuid('run');
        Route::post('runs/{run}/computer/{action}/claim', [ComputerRunnerController::class, 'claim'])->whereUuid('run')->whereUuid('action');
        Route::post('runs/{run}/computer/{action}/receipt', [ComputerRunnerController::class, 'receipt'])->whereUuid('run')->whereUuid('action');
    });
});

// Provider webhooks for triggers: no session and no market check (GitHub/Stripe servers call these);
// each request is authenticated by the trigger's own signing secret over the raw body.
Route::prefix('api/agents/v2/hooks')->middleware('throttle:120,1,agent-v2-hooks')->group(function (): void {
    Route::post('github/{trigger}', [TriggersController::class, 'github'])->whereUuid('trigger');
    Route::post('stripe/{trigger}', [TriggersController::class, 'stripe'])->whereUuid('trigger');
    Route::post('linear/{trigger}', [TriggersController::class, 'linear'])->whereUuid('trigger');
    Route::post('slack', [TriggersController::class, 'slack']);
    Route::post('api/{trigger}', [TriggersController::class, 'api'])->whereUuid('trigger');
});

// Phase 6 (Stage 3): catalogue readiness, remote MCP servers, Composio linking.
require __DIR__.'/agents_v2_integrations.php';

// Phase 8: task plan, activity, roster/read markers, attachments, starter teammates.
require __DIR__.'/agents_v2_overview.php';

// Phase 7 (Stage 4): browser grants and the leased Mac's browser actions.
require __DIR__.'/agents_v2_browser.php';

require __DIR__.'/agents_v2_local_mcp.php';

require __DIR__.'/agents_v2_stage2.php';

require __DIR__.'/agents_v2_cloud.php';
