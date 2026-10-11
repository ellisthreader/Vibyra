<?php
use App\Http\Controllers\AgentsV2\CapabilitiesController;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;
Route::prefix('api/agents/v2/capabilities')->middleware([RequireApprovedMarket::class,
    'throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function () {
    Route::get('{id}', [CapabilitiesController::class, 'show'])->where('id', '[a-z0-9_-]{1,100}');
    Route::put('{id}/install', [CapabilitiesController::class, 'put'])->where('id', '[a-z0-9_-]{1,100}');
    Route::delete('{id}/install', [CapabilitiesController::class, 'destroy'])->where('id', '[a-z0-9_-]{1,100}')
        ->withoutMiddleware(RequireApprovedMarket::class);
});
