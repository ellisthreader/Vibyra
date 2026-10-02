<?php

use App\Http\Controllers\AssistantController;
use App\Http\Middleware\{AssistantSession, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

// Bearer sessions only: no browser cookie authentication or general-purpose provider proxy.
Route::prefix('/api/assistant')->middleware([AssistantSession::class, RequireApprovedMarket::class])->group(function (): void {
    Route::get('/status', [AssistantController::class, 'status'])->middleware('throttle:120,1,assistant-status');
    Route::post('/chat', [AssistantController::class, 'chat']);
    Route::post('/transcriptions', [AssistantController::class, 'transcription']);
    Route::post('/speech', [AssistantController::class, 'speech']);
});
