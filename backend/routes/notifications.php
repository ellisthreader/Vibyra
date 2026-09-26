<?php
use App\Http\Controllers\PhoneNotificationsController as Phone;
use Illuminate\Support\Facades\Route;
Route::prefix('api/notifications/v1')->middleware('throttle:90,1,notifications')->group(function () {
    Route::match(['get', 'patch'], 'preferences', [Phone::class, 'preferences']);
    Route::post('devices', [Phone::class, 'register'])->middleware('throttle:10,1,notification-devices');
    Route::delete('devices/{id}', [Phone::class, 'revoke'])->whereUuid('id');
    Route::post('presence', [Phone::class, 'presence']);
    Route::get('inbox', [Phone::class, 'index']);
    Route::get('inbox/{id}', [Phone::class, 'show'])->whereUuid('id');
    Route::post('inbox/{id}/read', [Phone::class, 'read'])->whereUuid('id');
});

Route::post('api/vibes/auto-preparations', [\App\Http\Controllers\AutoPreparationController::class, 'create'])->middleware('throttle:12,1,auto-prepare');
Route::get('api/vibes/auto-preparations/{id}', [\App\Http\Controllers\AutoPreparationController::class, 'show'])->whereUuid('id')->middleware('throttle:90,1,auto-status');

Route::post('api/notifications/v1/host-credential', [\App\Http\Controllers\HostNotificationsController::class, 'credential'])->middleware('throttle:30,1,host-notify-grant');
Route::post('api/notifications/v1/host-events', [\App\Http\Controllers\HostNotificationsController::class, 'ingest'])->middleware('throttle:60,1,host-notify-events');
