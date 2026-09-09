<?php

use App\Http\Controllers\VibesController;
use App\Http\Controllers\VibesPurchaseController;
use App\Http\Controllers\VibesToolsController;
use Illuminate\Support\Facades\Route;

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
