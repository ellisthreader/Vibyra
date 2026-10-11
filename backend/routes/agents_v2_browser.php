<?php

use App\Http\Controllers\AgentsV2\{BrowserController, BrowserFilesController, PrivateBrowserController};
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

/*
 * Agent V2 Phase 7 (rebuild Stage 4): per-teammate browser grants (allowed sites) and
 * the leased Mac's browser actions. Contract: docs/agent-v2-api-contract.md §6e.
 */
Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class])->group(function (): void {
    Route::middleware(['throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
        Route::get('browser/private', [PrivateBrowserController::class, 'index']);
        Route::post('browser/private/{id}/open', [PrivateBrowserController::class, 'open'])->whereUuid('id');
        Route::get('browser/private/{id}/frame', [PrivateBrowserController::class, 'frame'])->whereUuid('id');
        Route::post('browser/private/{id}/input', [PrivateBrowserController::class, 'input'])->whereUuid('id');
        Route::get('agents/{agentId}/browser/files', [BrowserFilesController::class, 'index'])->whereUuid('agentId');
        Route::get('browser/files/{id}/download', [BrowserFilesController::class, 'download'])->whereUuid('id');
        Route::get('agents/{agentId}/browser', [BrowserController::class, 'show'])->whereUuid('agentId');
        Route::put('agents/{agentId}/browser', [BrowserController::class, 'put'])->whereUuid('agentId');
        Route::delete('agents/{agentId}/browser', [BrowserController::class, 'destroy'])->whereUuid('agentId')
            ->withoutMiddleware(RequireApprovedMarket::class);
    });
    Route::prefix('runner/{runtime}')->whereUuid('runtime')->middleware(['throttle:600,1,agent-v2-runner', AgentV2Credentials::class.':runner'])->group(function (): void {
        Route::get('browser-runs', [PrivateBrowserController::class, 'runs']);
        Route::post('browser/private/{id}/exchange', [PrivateBrowserController::class, 'exchange'])->whereUuid('id');
        Route::post('browser/private/{id}/abort', [PrivateBrowserController::class, 'abort'])->whereUuid('id');
        Route::post('runs/{run}/browser/{action}/handoff', [PrivateBrowserController::class, 'begin'])->whereUuid('run')->whereUuid('action');
        Route::post('runs/{run}/browser/files', [BrowserFilesController::class, 'store'])->whereUuid('run');
        Route::post('runs/{run}/browser/{action}/upload-file', [BrowserFilesController::class, 'upload'])->whereUuid('run')->whereUuid('action');
        Route::get('runs/{run}/browser', [BrowserController::class, 'index'])->whereUuid('run');
        Route::post('runs/{run}/browser/{action}/claim', [BrowserController::class, 'claim'])->whereUuid('run')->whereUuid('action');
        Route::post('runs/{run}/browser/{action}/receipt', [BrowserController::class, 'receipt'])->whereUuid('run')->whereUuid('action');
    });
});
