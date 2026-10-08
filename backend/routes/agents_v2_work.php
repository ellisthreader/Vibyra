<?php

use App\Http\Controllers\AgentsV2\{WorkProposalsController, GoalsController, FollowUpsController, SignalsController};
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

Route::prefix('api/agents/v2')->middleware(['throttle:120,1,agent-work', AgentV2Credentials::class.':user'])->group(function () {
    Route::get('proposals', [WorkProposalsController::class, 'index']);
    Route::get('proposals/{id}', [WorkProposalsController::class, 'show'])->whereUuid('id');
    Route::patch('proposals/{id}', [WorkProposalsController::class, 'update'])->whereUuid('id')->middleware(RequireApprovedMarket::class);
    Route::post('proposals/{id}/accept', [WorkProposalsController::class, 'accept'])->whereUuid('id')->middleware(RequireApprovedMarket::class);
    Route::post('proposals/{id}/discard', [WorkProposalsController::class, 'discard'])->whereUuid('id');
    Route::get('goals', [GoalsController::class, 'index']);
    Route::get('goals/{id}', [GoalsController::class, 'show'])->whereUuid('id');
    Route::post('goals/{id}/control', [GoalsController::class, 'control'])->whereUuid('id');
    Route::post('goals/{id}/confirm', [GoalsController::class, 'confirm'])->whereUuid('id');
    Route::get('followups', [FollowUpsController::class, 'index']);
    Route::get('followups/sources', [FollowUpsController::class, 'sources']);
    Route::get('followups/{id}', [FollowUpsController::class, 'show'])->whereUuid('id');
    Route::post('followups/{id}/control', [FollowUpsController::class, 'control'])->whereUuid('id');
    Route::get('signals', [SignalsController::class, 'index']);
    Route::put('signals/preferences', [SignalsController::class, 'preferences']);
    Route::put('signals/onboarding', [SignalsController::class, 'onboarding']);
    Route::put('signals/watches/{id}', [SignalsController::class, 'watch'])->whereUuid('id')->middleware(RequireApprovedMarket::class);
    Route::post('signals/findings/{id}/dismiss', [SignalsController::class, 'dismiss'])->whereUuid('id');
    Route::get('signals/digests/{id}', [SignalsController::class, 'digest'])->whereUuid('id');
});
