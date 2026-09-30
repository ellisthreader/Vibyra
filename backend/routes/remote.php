<?php

use App\Http\Controllers\RemoteAccessController;
use App\Http\Controllers\RemoteSessionController;
use App\Http\Controllers\TrustedRemoteDeviceController;
use App\Http\Controllers\RemoteSecurityController;
use App\Http\Middleware\RequireApprovedMarket;
use Illuminate\Support\Facades\Route;

// Remote access through Vibyra Cloud. Loaded from bootstrap/app.php beside
// routes/web.php; the same `web` group and bearer-session auth as the rest of
// /api, with CSRF already exempt for api/*.
Route::middleware(['web', RequireApprovedMarket::class])->group(function (): void {
    Route::post('/api/remote/relay/authorize', [RemoteAccessController::class, 'authorizeRelay'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::post('/api/remote/hosts/challenge', [RemoteAccessController::class, 'challenge'])->middleware('throttle:30,1,remote-challenge');
    Route::post('/api/remote/relay/events', [RemoteAccessController::class, 'relayEvents'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::get('/api/remote/hosts', [RemoteAccessController::class, 'hosts']);
    Route::post('/api/remote/hosts', [RemoteAccessController::class, 'registerHost'])->middleware('throttle:30,1,remote-register');
    Route::post('/api/remote/hosts/{hostId}/connect', [RemoteAccessController::class, 'connect'])->middleware('throttle:30,1,remote-connect');
    Route::delete('/api/remote/hosts/{hostId}', [RemoteAccessController::class, 'revoke'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::get('/api/remote/activity', [RemoteAccessController::class, 'activity']);
    Route::get('/api/remote/sessions', [RemoteSessionController::class, 'index']);
    Route::get('/api/remote/sessions/{id}', [RemoteSessionController::class, 'show'])->where('id', '[a-z0-9]{32}');
    Route::post('/api/remote/sessions/{id}/token', [RemoteSessionController::class, 'token'])->where('id', '[a-z0-9]{32}')->middleware('throttle:30,1,remote-connect');
    Route::delete('/api/remote/sessions/{id}', [RemoteSessionController::class, 'destroy'])->where('id', '[a-z0-9]{32}')
        ->withoutMiddleware(RequireApprovedMarket::class)->middleware('throttle:60,1,remote-disconnect');
    Route::post('/api/remote/sessions/{id}/disconnect', [RemoteSessionController::class, 'destroy'])->where('id', '[a-z0-9]{32}')
        ->withoutMiddleware(RequireApprovedMarket::class)->middleware('throttle:60,1,remote-disconnect');
    Route::post('/api/security/devices/register', [TrustedRemoteDeviceController::class, 'register']);
    Route::get('/api/security/devices', [TrustedRemoteDeviceController::class, 'index']);
    Route::delete('/api/security/devices', [TrustedRemoteDeviceController::class, 'destroyAll'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::get('/api/security/devices/{id}', [TrustedRemoteDeviceController::class, 'show'])->whereUuid('id');
    Route::delete('/api/security/devices/{id}', [TrustedRemoteDeviceController::class, 'destroy'])->whereUuid('id')->withoutMiddleware(RequireApprovedMarket::class);
    Route::post('/api/security/devices/{id}/challenge', [TrustedRemoteDeviceController::class, 'challenge'])->whereUuid('id');
    Route::get('/api/remote/hosts/{hostId}/devices/pending', [TrustedRemoteDeviceController::class, 'pending']);
    Route::post('/api/remote/hosts/{hostId}/devices/{id}/challenge', [TrustedRemoteDeviceController::class, 'decisionChallenge'])->whereUuid('id');
    Route::post('/api/remote/hosts/{hostId}/devices/{id}/decision', [TrustedRemoteDeviceController::class, 'decide'])->whereUuid('id');
    Route::get('/api/remote/hosts/{hostId}/security', [RemoteSecurityController::class, 'policy']);
    Route::get('/api/remote/hosts/{hostId}/restrictions', [RemoteSecurityController::class, 'restrictions'])->where('hostId', '[a-f0-9]{64}')->withoutMiddleware(RequireApprovedMarket::class);
    Route::post('/api/remote/hosts/{hostId}/security/challenge', [RemoteSecurityController::class, 'policyChallenge']);
    Route::post('/api/remote/hosts/{hostId}/security', [RemoteSecurityController::class, 'changePolicy'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::post('/api/remote/disable', [RemoteSecurityController::class, 'disable'])->withoutMiddleware(RequireApprovedMarket::class);
    Route::get('/api/remote/hosts/{hostId}/sessions/pending', [RemoteSecurityController::class, 'pending']);
    Route::post('/api/remote/hosts/{hostId}/sessions/{id}/challenge', [RemoteSecurityController::class, 'sessionChallenge'])->where('id', '[a-z0-9]{32}');
    Route::post('/api/remote/hosts/{hostId}/sessions/{id}/decision', [RemoteSecurityController::class, 'decideSession'])->where('id', '[a-z0-9]{32}');
});
