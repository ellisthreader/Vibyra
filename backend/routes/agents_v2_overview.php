<?php

use App\Http\Controllers\AgentsV2\{AttachmentsController, OverviewController, PlanController};
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

/*
 * Agent V2 Phase 8 (docs/agent-v2-api-contract.md §6d): task plan preview,
 * activity feed, roster + per-device read markers, attachments, starter teammates.
 */
Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class])->group(function (): void {
    Route::middleware(['throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
        Route::post('runs/preview', [PlanController::class, 'preview'])->middleware('throttle:60,1,agent-v2-preview');
        Route::get('activity', [OverviewController::class, 'activity']);
        Route::get('roster', [OverviewController::class, 'roster']);
        Route::post('agents/{agentId}/read', [OverviewController::class, 'read'])->whereUuid('agentId')
            ->withoutMiddleware(RequireApprovedMarket::class);
        Route::post('attachments', [AttachmentsController::class, 'store'])->middleware('throttle:30,1,agent-v2-attach');
        Route::get('templates', [PlanController::class, 'templates']);
        Route::post('templates/{key}/teammates', [PlanController::class, 'fromTemplate'])->where('key', '[a-z][a-z0-9_]{1,39}')
            ->middleware('throttle:30,1,agent-v2-routine');
    });
    Route::get('runner/{runtime}/runs/{run}/attachments/{attachment}', [AttachmentsController::class, 'fetch'])
        ->whereUuid('runtime')->whereUuid('run')->whereUuid('attachment')->middleware(['throttle:600,1,agent-v2-runner', AgentV2Credentials::class.':runner']);
});
