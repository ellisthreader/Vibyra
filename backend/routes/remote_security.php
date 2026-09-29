<?php

use App\Http\Controllers\RemotePasskeysController;
use Illuminate\Support\Facades\Route;

Route::middleware('web')->group(function (): void {
    Route::get('/app/{path?}', \App\Http\Controllers\RemoteWebClientController::class)->where('path', '.*');
    Route::get('/api/security/events', [\App\Http\Controllers\RemoteSecurityEventsController::class, 'index'])->middleware('throttle:60,1,security-events');
    Route::post('/api/security/events/{id}/read', [\App\Http\Controllers\RemoteSecurityEventsController::class, 'read'])->whereUuid('id');
    Route::get('/remote/verify', fn () => response()->view('remote.verify')
        ->header('Cache-Control', 'no-store')->header('Referrer-Policy', 'no-referrer')
        ->header('X-Frame-Options', 'DENY')->header('X-Robots-Tag', 'noindex, nofollow')
        ->header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"));
    Route::prefix('/api/security/passkeys')->group(function (): void {
        Route::get('/', [RemotePasskeysController::class, 'index']);
        Route::delete('/{id}', [RemotePasskeysController::class, 'destroy'])->whereNumber('id')->middleware('throttle:10,1,remote-passkey-remove');
        Route::post('/begin', [RemotePasskeysController::class, 'begin'])->middleware('throttle:10,1,remote-passkey-begin');
        Route::post('/options', [RemotePasskeysController::class, 'options'])->middleware('throttle:20,1,remote-passkey-options');
        Route::post('/finish', [RemotePasskeysController::class, 'finish'])->middleware('throttle:10,1,remote-passkey-finish');
        Route::get('/ceremonies/{id}', [RemotePasskeysController::class, 'status'])->whereUuid('id')->middleware('throttle:60,1,remote-passkey-status');
    });
});
