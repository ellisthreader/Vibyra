<?php

use App\Http\Controllers\BillingController;
use App\Http\Controllers\AnalyticsEventController;
use App\Http\Controllers\AnalyticsConsentController;
use App\Http\Controllers\OwnerAnalyticsController;
use App\Http\Controllers\OwnerAccountsController;
use App\Http\Controllers\OwnerTwoFactorEnrollmentController;
use App\Http\Controllers\HumanCheckController;
use App\Http\Controllers\LocalOwnerLoginController;
use App\Http\Controllers\PhoneWaitlistController;
use App\Http\Controllers\WebsiteFaqController;
use App\Http\Controllers\ReleaseDownloadController;
use App\Http\Controllers\ReleaseUpdateController;
use App\Http\Controllers\OpenRouterModelReleaseController;
use App\Http\Controllers\VibyraAppController;
use App\Http\Controllers\VibyraDesktopController;
use App\Http\Controllers\WebsiteAuthController;
use App\Http\Controllers\WebsiteAnalyticsController;
use App\Http\Controllers\WebsiteBillingController;
use App\Http\Controllers\WebsiteDownloadsController;
use App\Http\Controllers\WebsiteProviderAuthController;
use App\Http\Middleware\PublicCommunityCache;
use App\Http\Middleware\RecordWebsiteView;
use App\Http\Middleware\RequireOwner;
use App\Http\Middleware\VerifyHuman;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Support\Facades\Route;

// Public like the legal pages: Google's OAuth brand review must read the home page, and its checker is no named crawler.
Route::get('/', fn () => view('marketing'))->middleware(RecordWebsiteView::class);
Route::view('/legal/privacy', 'legal.privacy')->middleware(RecordWebsiteView::class)->name('legal.privacy');
Route::view('/legal/terms', 'legal.terms')->middleware(RecordWebsiteView::class)->name('legal.terms');
Route::view('/login', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class])->name('login');
Route::view('/signup', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::get('/forgot-password', fn () => response()->view('portal')->header('Cache-Control', 'private, no-store'))->middleware(VerifyHuman::class);
Route::view('/billing', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::view('/checkout', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::view('/billing/success', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::view('/billing/cancel', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::view('/downloads', 'downloads')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::view('/benchmarks', 'benchmarks')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::view('/account/downloads', 'downloads')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
Route::get('/owner/login', fn () => response()->view('portal')
    ->header('Cache-Control', 'private, no-store')
    ->header('X-Robots-Tag', 'noindex, nofollow'))->middleware(VerifyHuman::class);
Route::post('/web-api/human-check', HumanCheckController::class)->middleware('throttle:20,1');
Route::post('/web-api/owner/local-login', LocalOwnerLoginController::class)->middleware('throttle:5,1');
Route::get('/web-api/download-catalog', [WebsiteDownloadsController::class, 'catalog']);
Route::post('/web-api/phone-waitlist', [PhoneWaitlistController::class, 'store'])->middleware([VerifyHuman::class.':api', 'throttle:5,10']);
Route::post('/web-api/faq/ask', [WebsiteFaqController::class, 'ask'])->middleware([VerifyHuman::class.':api', 'throttle:12,1']);
Route::get('/web-api/releases', [ReleaseDownloadController::class, 'index']);
Route::get('/web-api/model-catalog', [\App\Http\Controllers\ModelCatalogController::class, 'index'])->middleware('throttle:60,1');
Route::get('/web-api/model-catalog/health', [\App\Http\Controllers\ModelCatalogController::class, 'health'])->middleware('throttle:60,1');
Route::get('/web-api/model-catalog/artwork/{hash}', [\App\Http\Controllers\ModelCatalogController::class, 'artwork'])
    ->where('hash', '[a-f0-9]{64}')->middleware('throttle:300,1');
Route::get('/web-api/openrouter/releases', [OpenRouterModelReleaseController::class, 'index'])
    ->middleware('throttle:30,1');
Route::get('/downloads/{platform}', [ReleaseDownloadController::class, 'download'])
    ->whereIn('platform', ['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64']);

// The signed package the in-app updater fetches. Only macOS has one of its own
// today; every other platform updates from the download URL above.
Route::get('/downloads/{platform}/update', [ReleaseDownloadController::class, 'updateArtifact'])
    ->whereIn('platform', ['windows', 'linux', 'linux-deb', 'macos-arm64', 'macos-x64']);

// The installed desktop app polls this every 20 minutes; 204 is the usual answer.
Route::get('/web-api/updates/{target}/{arch}/{bundleType}/{current}', [ReleaseUpdateController::class, 'check'])
    ->whereIn('target', ['linux', 'windows', 'darwin'])
    ->whereIn('arch', ['x86_64', 'aarch64', 'i686', 'armv7'])
    ->whereIn('bundleType', ['appimage', 'deb', 'rpm', 'nsis', 'msi', 'app', 'unknown'])
    ->where('current', '[0-9A-Za-z.+-]+')
    ->middleware('throttle:60,1');

Route::post('/web-api/auth/signup', [WebsiteAuthController::class, 'signup'])->middleware([VerifyHuman::class.':api', 'throttle:auth-signup']);
Route::post('/web-api/auth/login', [WebsiteAuthController::class, 'login'])->middleware([VerifyHuman::class.':api', 'throttle:auth-login']);
Route::delete('/web-api/auth/logout', [WebsiteAuthController::class, 'logout'])->middleware('auth');
Route::post('/web-api/auth/login/2fa', [WebsiteAuthController::class, 'loginTwoFactor'])->middleware([VerifyHuman::class.':api', 'throttle:8,1,web-login-2fa']);
Route::get('/web-api/analytics/consent', [WebsiteAnalyticsController::class, 'show'])->middleware('throttle:60,1');
Route::put('/web-api/analytics/consent', [WebsiteAnalyticsController::class, 'update'])->middleware('throttle:20,1');
Route::post('/web-api/analytics/event', [WebsiteAnalyticsController::class, 'event'])->middleware('throttle:120,1');
Route::post('/web-api/auth/password/forgot', [VibyraAppController::class, 'forgotPassword'])->middleware([VerifyHuman::class.':api', 'throttle:auth-password-forgot']);
Route::post('/web-api/auth/password/reset', [VibyraAppController::class, 'resetPassword'])->middleware('throttle:5,1,web-password-reset');
Route::get('/web-api/session', [WebsiteAuthController::class, 'session']);
Route::post('/web-api/auth/provider/{provider}/start', [WebsiteProviderAuthController::class, 'start'])
    ->whereIn('provider', ['apple', 'google'])->middleware([VerifyHuman::class.':api', 'throttle:auth-provider-start']);
Route::get('/web-api/auth/provider/{provider}/status/{flowId}', [WebsiteProviderAuthController::class, 'status'])
    ->whereIn('provider', ['apple', 'google'])->middleware('throttle:auth-provider-status');
Route::get('/web-api/auth/providers', [WebsiteProviderAuthController::class, 'providers'])
    ->middleware('throttle:60,1');

Route::middleware('auth')->group(function (): void {
    Route::view('/account', 'portal')->middleware([VerifyHuman::class, RecordWebsiteView::class]);
    Route::get('/owner', fn () => response()->view('portal')
        ->header('Cache-Control', 'private, no-store')
        ->header('X-Robots-Tag', 'noindex, nofollow'))->middleware(RequireOwner::class);
    Route::get('/web-api/owner/analytics', OwnerAnalyticsController::class)->middleware(RequireOwner::class);
    Route::post('/web-api/owner/verify-2fa', [OwnerAccountsController::class, 'verify'])
        ->middleware([RequireOwner::class, 'throttle:5,1,owner-2fa']);
    Route::post('/web-api/owner/2fa/provider/start', [OwnerTwoFactorEnrollmentController::class, 'providerStart'])
        ->middleware([RequireOwner::class, 'throttle:5,1']);
    Route::get('/web-api/owner/2fa/provider/status/{flowId}', [OwnerTwoFactorEnrollmentController::class, 'providerStatus'])
        ->where('flowId', '[A-Za-z0-9]{64}')->middleware([RequireOwner::class, 'throttle:60,1']);
    Route::post('/web-api/owner/2fa/start', [OwnerTwoFactorEnrollmentController::class, 'start'])
        ->middleware([RequireOwner::class, 'throttle:5,1']);
    Route::post('/web-api/owner/2fa/confirm', [OwnerTwoFactorEnrollmentController::class, 'confirm'])
        ->middleware([RequireOwner::class, 'throttle:8,1']);
    Route::get('/web-api/billing/orders/{order}', [\App\Http\Controllers\MembershipController::class, 'order'])->whereUuid('order');
    Route::get('/web-api/billing/account', [\App\Http\Controllers\MembershipController::class, 'snapshot']);
    Route::get('/web-api/billing/activity', [\App\Http\Controllers\MembershipController::class, 'activity']);
    Route::post('/web-api/billing/checkout', [WebsiteBillingController::class, 'checkout'])->middleware('throttle:10,1,web-billing-checkout');
    Route::post('/web-api/billing/portal', [WebsiteBillingController::class, 'portal'])->middleware('throttle:10,1,web-billing-portal');
});

