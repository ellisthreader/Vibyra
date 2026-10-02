<?php

use App\Http\Controllers\{OwnerLicensesController, LicenseRedemptionController};
use App\Http\Middleware\{RequireOwner, RequireOwnerSecondFactor, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

Route::prefix('web-api/owner/licenses')->middleware(['auth', RequireOwner::class, RequireOwnerSecondFactor::class])->group(function () {
    Route::get('/', [OwnerLicensesController::class, 'index'])->middleware('throttle:30,1,owner-licenses-read');
    Route::post('/', [OwnerLicensesController::class, 'store'])->middleware('throttle:10,1,owner-licenses-write');
    Route::post('/{license}/revoke', [OwnerLicensesController::class, 'revoke'])->whereUuid('license')->middleware('throttle:10,1,owner-licenses-write');
});
Route::post('/web-api/account/license', LicenseRedemptionController::class)
    ->middleware(['auth', RequireApprovedMarket::class, 'throttle:10,1,license-redeem-ip']);
Route::post('/api/account/license', LicenseRedemptionController::class)
    ->middleware([RequireApprovedMarket::class, 'throttle:10,1,license-redeem-ip']);
