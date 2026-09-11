<?php

use App\Http\Controllers\ChatConnectorsController;
use App\Http\Controllers\VibesController;
use App\Http\Controllers\VibesGuestController;
use App\Http\Controllers\VibesPurchaseController;
use App\Http\Controllers\VibesToolsController;
use Illuminate\Support\Facades\Route;

/*
 * Becoming a guest. Outside the group below because it is the one Vibes route
 * with no session yet, and because minting an account deserves a far tighter
 * limit than reading a wallet does.
 */
Route::post('api/vibes/guest', VibesGuestController::class)->middleware('throttle:6,60');

Route::prefix('api/vibes')->middleware('throttle:90,1')->group(function () {
    Route::get('wallet', [VibesController::class, 'wallet']);
    Route::post('consent', [VibesController::class, 'consent']);
    Route::get('models', [VibesController::class, 'models']);
    Route::match(['get', 'post'], 'chats', [VibesController::class, 'chats']);
    Route::post('quote', [VibesController::class, 'quote']);
    Route::post('turns', [VibesController::class, 'submit'])->middleware('throttle:12,1');
    Route::get('chats/{chat}/turns', [VibesController::class, 'turns'])->whereUuid('chat');
    Route::get('turns/{turn}', [VibesController::class, 'status'])->whereUuid('turn');
    Route::post('turns/{turn}/cancel', [VibesController::class, 'cancel'])->whereUuid('turn');
    Route::post('purchases', [VibesPurchaseController::class, 'claim'])->middleware('throttle:10,1');
    Route::post('chats/{chat}/project', [VibesToolsController::class, 'attach'])->whereUuid('chat');
    Route::post('tools/{tool}/result', [VibesToolsController::class, 'result'])->whereUuid('tool');
});

Route::post('api/vibes/apple-notifications', \App\Http\Controllers\VibesAppleNotificationController::class)->middleware('throttle:60,1');

/*
 * Integrations. The catalogue is public like the model list; connecting an account
 * and disconnecting it authenticate inside the controller. The sign-in callback
 * arrives from the provider's page in a browser with no app session, so it is
 * outside the group and proves itself with the single-use `state` instead.
 */
Route::get('api/connectors/callback/{integration}', [ChatConnectorsController::class, 'callback'])
    ->where('integration', '[a-z][a-z0-9]*')->middleware('throttle:30,1');

Route::prefix('api/connectors')->middleware('throttle:60,1')->group(function () {
    Route::get('/', [ChatConnectorsController::class, 'index']);
    Route::get('flows/{flow}', [ChatConnectorsController::class, 'flow'])->whereUuid('flow');
    Route::post('{integration}/start', [ChatConnectorsController::class, 'start'])->middleware('throttle:10,1');
    Route::post('{integration}/connect', [ChatConnectorsController::class, 'connect'])->middleware('throttle:10,1');
    Route::post('{integration}/disconnect', [ChatConnectorsController::class, 'disconnect']);
})->where('integration', '[a-z][a-z0-9]*');
