<?php

use App\Http\Controllers\Teams\{SsoAuthController, TeamController, TeamSsoController};
use Illuminate\Support\Facades\Route;

/*
 * Roadmap Part 13: Teams. Every route answers 404 while TEAMS_ENABLED is off. The Team page and its actions answer to the signed-in
 * browser session only; the SSO start and callback are public (they sign a person in) and throttled. Contract: docs/teams-contract.md.
 */
Route::post('api/auth/sso/start', [SsoAuthController::class, 'startApp'])->middleware('throttle:10,1,team-sso-start-app');
Route::get('api/auth/sso/status/{flowId}', [SsoAuthController::class, 'status'])->where('flowId', '[A-Za-z0-9]{64}')->middleware('throttle:120,1,team-sso-status');

// The routes loaded from bootstrap/app.php are not in the web group, so the ones that need a cookie session, CSRF and the
// browser login say so here (routes/web.php gets it for free). The app (bearer) routes above deliberately do not.
Route::middleware('web')->group(function (): void {
    // Render before sign-in so the invitation fragment is saved in this tab and the intended destination is preserved.
    Route::view('account/team', 'portal')->middleware(\App\Http\Middleware\RecordWebsiteView::class);
    Route::view('team/join', 'portal')->middleware(\App\Http\Middleware\RecordWebsiteView::class);
    Route::get('web-api/auth/sso', [SsoAuthController::class, 'available'])->middleware('throttle:60,1,team-sso-available');
    Route::post('web-api/auth/sso/start', [SsoAuthController::class, 'start'])->middleware('throttle:10,1,team-sso-start');
    Route::get('auth/sso/callback', [SsoAuthController::class, 'callback'])->middleware('throttle:30,1,team-sso-callback');
});

Route::middleware(['web', 'auth'])->group(function (): void {
    Route::prefix('web-api/team')->middleware('throttle:60,1,team')->group(function (): void {
        Route::get('/', [TeamController::class, 'show']);
        Route::post('/', [TeamController::class, 'create'])->middleware('throttle:5,1,team-create');
        Route::patch('/', [TeamController::class, 'rename']);
        Route::post('leave', [TeamController::class, 'leave']);
        Route::post('transfer', [TeamController::class, 'transfer']);
        Route::put('cap', [TeamController::class, 'defaultCap']);
        Route::delete('members/{id}', [TeamController::class, 'remove'])->whereNumber('id');
        Route::patch('members/{id}', [TeamController::class, 'role'])->whereNumber('id');
        Route::put('members/{id}/cap', [TeamController::class, 'memberCap'])->whereNumber('id');
        Route::post('invitations', [TeamController::class, 'invite'])->middleware('throttle:20,1,team-invite');
        Route::delete('invitations/{id}', [TeamController::class, 'revoke'])->whereUuid('id');
        Route::post('invitations/preview', [TeamController::class, 'preview']);
        Route::post('invitations/accept', [TeamController::class, 'accept'])->middleware('throttle:10,1,team-accept');
        Route::put('sso', [TeamSsoController::class, 'save'])->middleware('throttle:10,1,team-sso-save');
        Route::post('sso/verify', [TeamSsoController::class, 'verify'])->middleware('throttle:10,1,team-sso-verify');
        Route::post('sso/enable', [TeamSsoController::class, 'enable']);
        Route::delete('sso', [TeamSsoController::class, 'remove']);
    });
});
