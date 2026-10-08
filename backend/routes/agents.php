<?php

use App\Http\Controllers\AgentsController;
use App\Http\Controllers\AgentDecisionsController;
use Illuminate\Support\Facades\Route;

Route::prefix('api/agents/v1')->middleware('throttle:90,1,agent-api')->group(function (): void {
    Route::get('skills', [\App\Http\Controllers\AgentSkillsController::class, 'index']);
    Route::post('skills', [\App\Http\Controllers\AgentSkillsController::class, 'save']);
    Route::get('teammates', [AgentsController::class, 'index']);
    Route::post('teammates', [AgentsController::class, 'save'])->middleware('throttle:12,1,agent-create');
    Route::post('teammates/{id}', [AgentsController::class, 'save'])->whereUuid('id');
    Route::post('teammates/{id}/archive', [AgentsController::class, 'archive'])->whereUuid('id');
    Route::post('teammates/{id}/read', [AgentsController::class, 'read'])->whereUuid('id');
    Route::get('teammates/{id}/chats', [AgentsController::class, 'chat'])->whereUuid('id');
    Route::post('decisions/{id}', [AgentDecisionsController::class, 'resolve'])->whereUuid('id');
    Route::get('workspaces', [\App\Http\Controllers\AgentWorkspacesController::class, 'index']);
    Route::post('workspaces', [\App\Http\Controllers\AgentWorkspacesController::class, 'register'])
        ->middleware('throttle:12,1,agent-workspace');
    Route::delete('workspaces/{id}', [\App\Http\Controllers\AgentWorkspacesController::class, 'revoke'])->whereUuid('id');
    Route::get('workspaces/{id}/pending', [\App\Http\Controllers\AgentWorkspacesController::class, 'pending'])->whereUuid('id');
    Route::post('workspaces/{id}/tools/{tool}/claim', [\App\Http\Controllers\AgentWorkspacesController::class, 'claim'])
        ->whereUuid('id')->whereUuid('tool');
    Route::post('workspaces/{id}/tools/{tool}/result', [\App\Http\Controllers\AgentWorkspacesController::class, 'result'])
        ->whereUuid('id')->whereUuid('tool');
});
