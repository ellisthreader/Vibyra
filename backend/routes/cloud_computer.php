<?php

use App\Http\Controllers\CloudComputer\{AccessController, ComputerController, ConnectController, FaceController, MacConnectController, RepoController, RuntimeController, SyncBlobController, SyncController, SyncLoginController, SyncPartController, SyncRuntimeController};
use App\Http\Middleware\RequireApprovedMarket;
use Illuminate\Support\Facades\Route;

// The account's cloud computer (headless vibyra-host on the hosted VM). Phone/Mac side, bearer session.
// Every cloud-computer limiter is per account (AppServiceProvider): a phone and a Mac on one home IP do not share a bucket.
Route::prefix('api/cloud-computer')->middleware('throttle:cloud-computer-read')->group(function () {
    Route::get('/', [ComputerController::class, 'show']);
    Route::post('/', [ComputerController::class, 'create'])->middleware([RequireApprovedMarket::class, 'throttle:cloud-computer-create']);
    Route::post('connect', ConnectController::class)->middleware([RequireApprovedMarket::class, 'throttle:cloud-computer-connect']);
    Route::post('connect/mac', MacConnectController::class)->middleware([RequireApprovedMarket::class, 'throttle:cloud-computer-connect']);
    Route::post('face-key', [FaceController::class, 'enroll'])->middleware('throttle:cloud-computer-face-key');
    Route::post('face-challenge', [FaceController::class, 'challenge'])->middleware('throttle:cloud-computer-face-challenge');
    Route::delete('connect', [ConnectController::class, 'revoke'])->middleware('throttle:cloud-computer-connect');
    Route::post('wake', [ComputerController::class, 'wake'])->middleware([RequireApprovedMarket::class, 'throttle:cloud-computer-wake']);
    Route::post('stop', [ComputerController::class, 'stop']);
    Route::get('repos', [RepoController::class, 'index'])->middleware('throttle:cloud-computer-repos');
    Route::post('projects', [ComputerController::class, 'projects'])->middleware('throttle:cloud-computer-projects');
    // What Vibyra Cloud may use (docs/cloud-access-contract.md).
    Route::get('access', [AccessController::class, 'show']);
    Route::put('access/projects', [AccessController::class, 'projects'])->middleware('throttle:cloud-access-projects');
    Route::put('access/providers/codex', [AccessController::class, 'codex'])->middleware('throttle:cloud-access-codex');
});

// VM side. Same runtime bearer as the hosted workspace runtime (Runtime::authenticate).
Route::prefix('api/cloud-runtime')->middleware('throttle:cloud-runtime')->group(function () {
    Route::post('{workspace}/host/challenge', [RuntimeController::class, 'challenge']);
    Route::post('{workspace}/host/register', [RuntimeController::class, 'register']);
    Route::post('{workspace}/host/activity', [RuntimeController::class, 'activity']);
    Route::get('{workspace}/projects/pending', [RuntimeController::class, 'pending']);
    Route::post('{workspace}/projects/{id}/done', [RuntimeController::class, 'done']);
})->whereUuid(['workspace', 'id']);

// Cloud sync (docs/cloud-sync-contract.md), account side. Works while the computer is stopped; the account must be eligible.
// Its `cloud-sync` rate limiter lives in AppServiceProvider (a cached route file never runs its own code).
// Storing needs an approved market; reading state and deleting stay open everywhere (the rights path).
Route::prefix('api/cloud-computer/sync')->middleware('throttle:cloud-sync')->group(function () {
    Route::get('/', [SyncController::class, 'index']);
    Route::put('macs/{deviceId}', [SyncController::class, 'putMac'])->whereUuid('deviceId')->middleware(RequireApprovedMarket::class);
    Route::put('macs/{deviceId}/status', [SyncController::class, 'report'])->whereUuid('deviceId');
    Route::post('repair', [SyncController::class, 'repair'])->middleware(['throttle:cloud-sync-repair', RequireApprovedMarket::class]);
    Route::post('projects', [SyncController::class, 'project'])->middleware(RequireApprovedMarket::class);
    Route::put('projects/{name}/up', [SyncBlobController::class, 'up'])->middleware(RequireApprovedMarket::class);
    Route::put('projects/{name}/up-part', [SyncPartController::class, 'up'])->middleware(RequireApprovedMarket::class);
    Route::delete('projects/{name}', [SyncController::class, 'remove']);
    Route::put('login/{provider}', [SyncLoginController::class, 'put'])->middleware(['throttle:cloud-sync-login', RequireApprovedMarket::class]);
    Route::delete('login/{provider}', [SyncLoginController::class, 'delete'])->middleware('throttle:cloud-sync-login');
    Route::get('down', [SyncBlobController::class, 'down']);
    Route::get('down/{id}', [SyncBlobController::class, 'file'])->whereUuid('id');
    Route::post('down/{id}/ack', [SyncBlobController::class, 'ack'])->whereUuid('id');
})->where(['name' => '[A-Za-z0-9._-]{1,64}']);

// Cloud sync, VM side (runtime bearer; computer workspaces only).
Route::prefix('api/cloud-runtime/{workspace}/sync')->middleware('throttle:cloud-runtime')->group(function () {
    Route::post('key', [SyncRuntimeController::class, 'key']);
    Route::get('macs', [SyncRuntimeController::class, 'macs']);
    Route::get('pending', [SyncRuntimeController::class, 'pending']);
    Route::get('state', [SyncRuntimeController::class, 'state']);
    Route::post('status', [SyncRuntimeController::class, 'status']);
    Route::get('blobs/{id}', [SyncRuntimeController::class, 'blob']);
    Route::post('blobs/{id}/applied', [SyncRuntimeController::class, 'applied']);
    Route::put('projects/{name}/down', [SyncRuntimeController::class, 'down']);
})->whereUuid(['workspace', 'id'])->where(['name' => '[A-Za-z0-9._-]{1,64}']);
