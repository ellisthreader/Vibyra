<?php

use App\Http\Controllers\SpendCapsController;
use Illuminate\Support\Facades\Route;

// Reading and changing a person's own limits never spends anything, so none of it is market-gated.
Route::prefix('api/vibes/spend-caps')->middleware('throttle:60,1,spend-caps')->group(function () {
    Route::get('/', [SpendCapsController::class, 'show']);
    // The phone's request helper only speaks GET and POST, so writing is both.
    Route::match(['put', 'post'], '/', [SpendCapsController::class, 'update']);
    Route::post('raise', [SpendCapsController::class, 'raise']);
});
