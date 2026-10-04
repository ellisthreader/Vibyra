<?php

use App\Http\Controllers\Platform\{ActivityController, DeveloperController, PlatformApiController, PlatformMcpController};
use App\Http\Middleware\AuthenticateApiKey as Key;
use Illuminate\Support\Facades\Route;

/*
 * Roadmap Part 11: platform and developer API. Everything is off until its PLATFORM_* flag is on (config/platform.php).
 * Key-authenticated routes live under /api/platform and answer to a personal API key only; the portal's Developer page and the
 * activity list answer to a person's session only. No route here approves an action, touches billing or manages keys by key.
 */
Route::prefix('api/platform')->middleware('throttle:600,1,platform-ip')->group(function (): void {
    Route::prefix('v1')->group(function (): void {
        Route::get('runs', [PlatformApiController::class, 'runs'])->middleware(Key::class.':runs:read');
        Route::get('runs/{id}', [PlatformApiController::class, 'show'])->whereUuid('id')->middleware(Key::class.':runs:read');
        Route::post('runs', [PlatformApiController::class, 'start'])->middleware(Key::class.':runs:create');
        Route::get('projects', [PlatformApiController::class, 'projects'])->middleware(Key::class.':projects:read');
        Route::post('triggers/{id}/invoke', [PlatformApiController::class, 'invoke'])->whereUuid('id')->middleware(Key::class.':triggers:invoke');
    });
    // Streamable HTTP, stateless: POST only. Tools are filtered by the key's scopes inside.
    Route::post('mcp', [PlatformMcpController::class, 'handle'])->middleware(Key::class);
    Route::match(['get', 'delete'], 'mcp', [PlatformMcpController::class, 'refuse']);
});

Route::get('api/account/activity', [ActivityController::class, 'app'])->middleware('throttle:60,1,account-activity');

// The portal answers to the website session, so these need the web group (session, cookies, CSRF) as well as auth.
Route::middleware(['web', 'auth'])->group(function (): void {
    Route::view('account/developer', 'portal')->middleware(\App\Http\Middleware\RecordWebsiteView::class);
    Route::get('web-api/account/activity', [ActivityController::class, 'web'])->middleware('throttle:60,1,account-activity');
    Route::get('web-api/developer', [DeveloperController::class, 'show']);
    Route::post('web-api/developer/keys', [DeveloperController::class, 'createKey'])->middleware('throttle:10,1,developer-keys');
    Route::delete('web-api/developer/keys/{id}', [DeveloperController::class, 'revokeKey'])->whereUuid('id');
    Route::post('web-api/developer/webhooks', [DeveloperController::class, 'createWebhook'])->middleware('throttle:10,1,developer-webhooks');
    Route::post('web-api/developer/webhooks/{id}/pause', [DeveloperController::class, 'pauseWebhook'])->whereUuid('id');
    Route::delete('web-api/developer/webhooks/{id}', [DeveloperController::class, 'deleteWebhook'])->whereUuid('id');
    Route::get('web-api/developer/webhooks/{id}/deliveries', [DeveloperController::class, 'deliveries'])->whereUuid('id');
});
