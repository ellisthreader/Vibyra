<?php

use App\Http\Controllers\AgentsV2\RulesController;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class, 'throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
    Route::get('agents/{agentId}/rules', [RulesController::class, 'index'])->whereUuid('agentId');
    Route::post('agents/{agentId}/rules', [RulesController::class, 'save'])->whereUuid('agentId')->middleware('throttle:30,1,agent-v2-rules');
    Route::delete('agents/{agentId}/rules/{ruleId}', [RulesController::class, 'revoke'])->whereUuid('agentId')->whereUuid('ruleId')
        ->withoutMiddleware(RequireApprovedMarket::class);
    Route::get('rules/status', [RulesController::class, 'status']);
    Route::post('rules/kill-switch', [RulesController::class, 'pause'])->withoutMiddleware(RequireApprovedMarket::class);
});
