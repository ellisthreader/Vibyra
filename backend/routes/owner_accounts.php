<?php

use App\Http\Controllers\{OwnerAccountsController, OwnerAccountActionsController};
use App\Http\Middleware\{RequireOwner, RequireOwnerSecondFactor, RequireOwnerAccountScope};
use Illuminate\Support\Facades\Route;

Route::prefix('web-api/owner/accounts')->middleware(['auth', RequireOwner::class, RequireOwnerSecondFactor::class, RequireOwnerAccountScope::class])->group(function () {
    Route::get('/', [OwnerAccountsController::class, 'index'])->middleware('throttle:60,1,owner-accounts-read');
    Route::get('/{account}', [OwnerAccountActionsController::class, 'show'])->where('account', '[1-9][0-9]{0,17}')
        ->middleware('throttle:60,1,owner-accounts-read');
    Route::post('/{account}/actions', [OwnerAccountActionsController::class, 'store'])->where('account', '[1-9][0-9]{0,17}')
        ->middleware('throttle:10,1,owner-accounts-write');
    Route::get('/{account}/actions/{requestId}', [OwnerAccountActionsController::class, 'receipt'])
        ->where('account', '[1-9][0-9]{0,17}')->whereUuid('requestId')->middleware('throttle:60,1,owner-accounts-read');
    Route::post('/{account}/actions/{requestId}/cancel', [OwnerAccountActionsController::class, 'cancel'])
        ->where('account', '[1-9][0-9]{0,17}')->whereUuid('requestId')->middleware('throttle:10,1,owner-accounts-write');
});
