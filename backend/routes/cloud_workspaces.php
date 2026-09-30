<?php

use App\Http\Controllers\CloudWorkspaces\{WorkspaceController, ActionController, RuntimeController, ManagementController};
use Illuminate\Support\Facades\Route;

Route::prefix('api/cloud-workspaces')->middleware('throttle:120,1,cloud-read')->group(function () {
    Route::get('/', [WorkspaceController::class, 'index']);
    Route::post('/', [WorkspaceController::class, 'create'])->middleware([\App\Http\Middleware\RequireApprovedMarket::class, 'throttle:6,1,cloud-create']);
    Route::get('{workspace}', [WorkspaceController::class, 'show']);
    Route::post('{workspace}/import', [WorkspaceController::class, 'import'])->middleware('throttle:6,1,cloud-import');
    Route::post('{workspace}/quote', [WorkspaceController::class, 'quote'])->middleware([\App\Http\Middleware\RequireApprovedMarket::class, 'throttle:12,1,cloud-quote']);
    Route::post('{workspace}/start', [WorkspaceController::class, 'start'])->middleware([\App\Http\Middleware\RequireApprovedMarket::class, 'throttle:6,1,cloud-start']);
    Route::post('{workspace}/stop', [WorkspaceController::class, 'stop']);
    Route::post('{workspace}/access', [ManagementController::class, 'access']);
    Route::post('{workspace}/budget', [ManagementController::class, 'budget']);
    Route::post('{workspace}/preview', [ManagementController::class, 'preview'])->middleware('throttle:6,1,cloud-preview');
    Route::delete('{workspace}', [ManagementController::class, 'delete']);
    Route::get('{workspace}/export', [WorkspaceController::class, 'export']);
    Route::get('{workspace}/receipts', [WorkspaceController::class, 'receipts']);
    Route::post('{workspace}/actions', [ActionController::class, 'create']);
    Route::get('{workspace}/actions/{action}', [ActionController::class, 'show']);
    Route::post('{workspace}/actions/{action}/cancel', [ActionController::class, 'cancel']);
})->whereUuid(['workspace', 'action']);

Route::prefix('api/cloud-runtime')->middleware('throttle:cloud-runtime')->group(function () {
    Route::post('{workspace}/bootstrap', [RuntimeController::class, 'bootstrap']);
    Route::post('{workspace}/heartbeat', [RuntimeController::class, 'heartbeat']);
    Route::post('{workspace}/checkpoint', [RuntimeController::class, 'checkpoint']);
    Route::get('{workspace}/actions/next', [RuntimeController::class, 'next']);
    Route::post('{workspace}/actions/{action}/result', [RuntimeController::class, 'result']);
})->whereUuid(['workspace', 'action']);
