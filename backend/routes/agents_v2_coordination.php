<?php
use App\Http\Controllers\AgentsV2\{GroupsController, WorkflowsController};
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;
Route::prefix('api/agents/v2')->middleware(['throttle:120,1,agent-coordination', AgentV2Credentials::class.':user'])->group(function () {
    Route::get('groups', [GroupsController::class, 'index']);
    Route::get('groups/{id}', [GroupsController::class, 'show'])->whereUuid('id');
    Route::put('groups/{id}', [GroupsController::class, 'save'])->whereUuid('id')->middleware(RequireApprovedMarket::class);
    Route::delete('groups/{id}', [GroupsController::class, 'delete'])->whereUuid('id');
    Route::get('groups/{id}/messages', [GroupsController::class, 'messages'])->whereUuid('id');
    Route::post('groups/{id}/messages', [GroupsController::class, 'send'])->whereUuid('id')->middleware(RequireApprovedMarket::class);
    Route::get('groups/{id}/workflows', [WorkflowsController::class, 'index'])->whereUuid('id');
    Route::get('workflows/{id}', [WorkflowsController::class, 'show'])->whereUuid('id');
    Route::post('workflows/{id}/control', [WorkflowsController::class, 'control'])->whereUuid('id');
    Route::post('workflows/{id}/confirm', [WorkflowsController::class, 'confirm'])->whereUuid('id');
});
