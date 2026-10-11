<?php
use App\Http\Controllers\AgentsV2\BrowserWorkflowsController as C;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;
Route::prefix('api/agents/v2/browser-workflows')->middleware([RequireApprovedMarket::class,
    'throttle:60,1,agent-browser-workflows', AgentV2Credentials::class.':user'])->group(function () {
    Route::get('/', [C::class, 'index']); Route::post('/', [C::class, 'store']);
    Route::get('{id}', [C::class, 'show'])->whereUuid('id'); Route::put('{id}', [C::class, 'update'])->whereUuid('id');
    Route::post('{id}/test', [C::class, 'test'])->whereUuid('id'); Route::post('{id}/save', [C::class, 'save'])->whereUuid('id');
});
