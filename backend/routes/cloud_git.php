<?php

use App\Http\Controllers\CloudWorkspaces\{GitCredentialController, GitEventController, GitPullRequestController};
use Illuminate\Support\Facades\Route;

// Runtime bearer (the VM). The credential route is the ONLY place a GitHub token is minted for a git remote.
Route::prefix('api/cloud-runtime')->group(function () {
    Route::get('{workspace}/git/credential', [GitCredentialController::class, 'show'])->middleware('throttle:cloud-git-credential');
    Route::post('{workspace}/events', [GitEventController::class, 'create'])->middleware('throttle:30,1,cloud-events');
})->whereUuid('workspace');

// User bearer (phone / Mac).
Route::post('api/cloud-computer/pull-request', [GitPullRequestController::class, 'create'])->middleware('throttle:20,1,cloud-pull-request');
