<?php

use App\Http\Controllers\AgentsV2\CloudController;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

Route::prefix('api/agents/v2/cloud')->middleware(['throttle:60,1,agent-cloud', AgentV2Credentials::class.':user'])->group(function () {
    Route::get('/', [CloudController::class, 'show']);
    Route::post('quote', [CloudController::class, 'quote'])->middleware(RequireApprovedMarket::class);
    Route::put('/', [CloudController::class, 'save'])->middleware(RequireApprovedMarket::class);
    Route::delete('/', [CloudController::class, 'revoke']);
});
Route::prefix('api/cloud-runtime/{workspace}/agents')->middleware('throttle:cloud-runtime')->whereUuid('workspace')->group(function () {
    Route::get('next', [CloudController::class, 'next']);
    Route::post('accounts', [CloudController::class, 'accounts']);
    Route::post('register', [CloudController::class, 'register']);
});
