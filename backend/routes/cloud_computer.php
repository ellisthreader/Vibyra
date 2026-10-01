<?php

use App\Http\Controllers\CloudComputer\{ComputerController, RepoController, RuntimeController};
use App\Http\Middleware\RequireApprovedMarket;
use Illuminate\Support\Facades\Route;

// The account's cloud computer (headless vibyra-host on the hosted VM). Phone/Mac side, bearer session.
Route::prefix('api/cloud-computer')->middleware('throttle:120,1,cloud-computer-read')->group(function () {
    Route::get('/', [ComputerController::class, 'show']);
    Route::post('/', [ComputerController::class, 'create'])->middleware([RequireApprovedMarket::class, 'throttle:6,1,cloud-computer-create']);
    Route::post('wake', [ComputerController::class, 'wake'])->middleware([RequireApprovedMarket::class, 'throttle:6,1,cloud-computer-wake']);
    Route::post('stop', [ComputerController::class, 'stop']);
    Route::get('repos', [RepoController::class, 'index'])->middleware('throttle:30,1,cloud-computer-repos');
    Route::post('projects', [ComputerController::class, 'projects'])->middleware('throttle:30,1,cloud-computer-projects');
});

// VM side. Same runtime bearer as the hosted workspace runtime (Runtime::authenticate).
Route::prefix('api/cloud-runtime')->middleware('throttle:cloud-runtime')->group(function () {
    Route::post('{workspace}/host/challenge', [RuntimeController::class, 'challenge']);
    Route::post('{workspace}/host/register', [RuntimeController::class, 'register']);
    Route::post('{workspace}/host/activity', [RuntimeController::class, 'activity']);
    Route::get('{workspace}/projects/pending', [RuntimeController::class, 'pending']);
    Route::post('{workspace}/projects/{id}/done', [RuntimeController::class, 'done']);
})->whereUuid(['workspace', 'id']);
