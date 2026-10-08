<?php

use App\Http\Controllers\AgentsV2\{SteeringController, DraftsController, OutputsController};
use App\Http\Controllers\AgentV2MemoryController;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class])->group(function (): void {
    Route::middleware(['throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
        Route::get('actions/{id}/draft', [DraftsController::class, 'show'])->whereUuid('id');
        Route::patch('actions/{id}/draft', [DraftsController::class, 'update'])->whereUuid('id');
        Route::get('teammates/{id}/outputs', [OutputsController::class, 'index'])->whereUuid('id');
        Route::get('outputs/{id}', [OutputsController::class, 'show'])->whereUuid('id');
        Route::patch('outputs/{id}', [OutputsController::class, 'update'])->whereUuid('id');
        Route::get('outputs/{id}/export', [OutputsController::class, 'export'])->whereUuid('id');
        Route::post('runs/{id}/instructions', [SteeringController::class, 'store'])->whereUuid('id');
        Route::get('teammates/{id}/memories', [AgentV2MemoryController::class, 'index'])->whereUuid('id');
        Route::post('teammates/{id}/memories', [AgentV2MemoryController::class, 'store'])->whereUuid('id');
        Route::patch('teammates/{id}/memories/{memoryId}', [AgentV2MemoryController::class, 'update'])->whereUuid('id')->whereUuid('memoryId');
    });
    Route::prefix('runner/{runtime}')->whereUuid('runtime')->middleware(['throttle:600,1,agent-v2-runner', AgentV2Credentials::class.':runner'])->group(function (): void {
        Route::post('runs/{run}/checkpoint', [SteeringController::class, 'checkpoint'])->whereUuid('run');
    });
});
