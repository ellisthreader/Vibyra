<?php

use App\Http\Controllers\Account\StartController;
use Illuminate\Support\Facades\Route;

// Where the phone starts (docs/start-route-contract.md). Same `web` group and bearer-session auth as the rest of /api.
// Reading only: linking/forgetting a Mac (PUT/DELETE /api/account/macs/{deviceId}) is not part of this release.
Route::middleware('web')->group(function (): void {
    Route::get('/api/account/start', [StartController::class, 'show'])->middleware('throttle:60,1,account-start');
});
