<?php

use App\Http\Controllers\RemoteAccessController;
use Illuminate\Support\Facades\Route;

// Remote access through Vibyra Cloud. Loaded from bootstrap/app.php beside
// routes/web.php; the same `web` group and bearer-session auth as the rest of
// /api, with CSRF already exempt for api/*.
Route::middleware('web')->group(function (): void {
    Route::post('/api/remote/relay/events', [RemoteAccessController::class, 'relayEvents']);
    Route::get('/api/remote/hosts', [RemoteAccessController::class, 'hosts']);
    Route::post('/api/remote/hosts', [RemoteAccessController::class, 'registerHost'])->middleware('throttle:30,1,remote-register');
    Route::post('/api/remote/hosts/{hostId}/connect', [RemoteAccessController::class, 'connect'])->middleware('throttle:30,1,remote-connect');
    Route::delete('/api/remote/hosts/{hostId}', [RemoteAccessController::class, 'revoke']);
    Route::get('/api/remote/activity', [RemoteAccessController::class, 'activity']);
});
