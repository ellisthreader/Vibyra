<?php
use App\Http\Controllers\LiveActivitiesController as Live;
use App\Http\Middleware\RequireApprovedMarket;
use Illuminate\Support\Facades\Route;

// iPhone Live Activities (flag LIVE_ACTIVITIES_ENABLED). Loaded from routes/notifications.php.
Route::prefix('api/notifications/v1/live-activities')->middleware([RequireApprovedMarket::class, 'throttle:60,1,live-activities'])->group(function () {
    Route::match(['get', 'patch'], 'preferences', [Live::class, 'preferences'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::match(['put', 'delete'], 'push-to-start', [Live::class, 'pushToStart']);
    Route::match(['put', 'delete'], 'runs/{runId}/token', [Live::class, 'runToken'])->whereUuid('runId');
    Route::delete('/', [Live::class, 'clear'])->withoutMiddleware(RequireApprovedMarket::class);
});
