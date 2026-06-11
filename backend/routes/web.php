<?php

use App\Http\Controllers\BillingController;
use App\Http\Controllers\VibyraAppController;
use App\Http\Controllers\VibyraDesktopController;
use Illuminate\Support\Facades\Route;

if (config('desktop.legacy_routes_enabled')) {
    Route::get('/', [VibyraDesktopController::class, 'app']);
    Route::get('/desktop', [VibyraDesktopController::class, 'app']);
    Route::get('/desktop/state', [VibyraDesktopController::class, 'state']);
    Route::post('/desktop/approve', [VibyraDesktopController::class, 'approve']);
    Route::post('/desktop/deny', [VibyraDesktopController::class, 'deny']);

    Route::get('/health', [VibyraDesktopController::class, 'health']);
    Route::post('/pair', [VibyraDesktopController::class, 'pair']);
    Route::get('/pair/status', [VibyraDesktopController::class, 'pairStatus']);
    Route::get('/projects', [VibyraDesktopController::class, 'projects']);
    Route::post('/projects/create', [VibyraDesktopController::class, 'createProject']);
    Route::get('/desktop/folders', [VibyraDesktopController::class, 'desktopFolders']);
    Route::get('/desktop/search', [VibyraDesktopController::class, 'desktopSearch']);
    Route::get('/files', [VibyraDesktopController::class, 'files']);
    Route::post('/files/create', [VibyraDesktopController::class, 'createFile']);
    Route::get('/files/read', [VibyraDesktopController::class, 'readFile']);
    Route::get('/events', [VibyraDesktopController::class, 'events']);
    Route::get('/preview/project/{projectId}/{token}/{path?}', [VibyraDesktopController::class, 'projectPreview'])->where('path', '.*');
    Route::post('/preview/start', [VibyraDesktopController::class, 'startPreview']);
    Route::post('/agents/start', [VibyraDesktopController::class, 'startAgent']);
    Route::post('/agents/apply', [VibyraDesktopController::class, 'applyAgent']);
    Route::post('/agents/discard', [VibyraDesktopController::class, 'discardAgent']);
    Route::post('/commands/run', [VibyraDesktopController::class, 'runCommand']);
}

Route::post('/api/auth/signup', [VibyraAppController::class, 'signup'])->middleware('throttle:5,1');
Route::post('/api/auth/login', [VibyraAppController::class, 'login'])->middleware('throttle:10,1');
Route::post('/api/auth/provider/challenge', [VibyraAppController::class, 'providerChallenge'])->middleware('throttle:12,1');
Route::post('/api/auth/desktop/{provider}/start', [VibyraAppController::class, 'desktopProviderStart'])
    ->whereIn('provider', ['apple', 'google'])
    ->middleware('throttle:12,1');
Route::get('/api/auth/desktop/{provider}/status/{flowId}', [VibyraAppController::class, 'desktopProviderStatus'])
    ->whereIn('provider', ['apple', 'google'])
    ->middleware('throttle:120,1');
Route::match(['get', 'post'], '/api/auth/desktop/{provider}/callback', [VibyraAppController::class, 'desktopProviderCallback'])
    ->whereIn('provider', ['apple', 'google'])
    ->middleware('throttle:30,1')
    ->name('auth.desktop.callback');
Route::post('/api/auth/password/forgot', [VibyraAppController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/api/auth/password/reset', [VibyraAppController::class, 'resetPassword'])->middleware('throttle:5,1');
Route::get('/api/auth/password/open', [VibyraAppController::class, 'openPasswordReset'])->middleware('throttle:12,1');
Route::get('/reset-password', [VibyraAppController::class, 'showPasswordResetLink'])->middleware('throttle:30,1');
Route::get('/.well-known/apple-app-site-association', [VibyraAppController::class, 'appleAppSiteAssociation']);
Route::get('/.well-known/assetlinks.json', [VibyraAppController::class, 'androidAssetLinks']);
Route::post('/api/auth/email/resend', [VibyraAppController::class, 'resendEmailVerification'])->middleware('throttle:5,1');
Route::delete('/api/auth/logout', [VibyraAppController::class, 'logoutCurrentSession']);
Route::post('/api/auth/session/rotate', [VibyraAppController::class, 'rotateCurrentSession']);
Route::get('/api/auth/email/verify/{id}/{hash}', [VibyraAppController::class, 'verifyEmail'])
    ->middleware('throttle:12,1')
    ->name('verification.verify');
Route::post('/api/account/profile', [VibyraAppController::class, 'updateAccountProfile']);
Route::post('/api/account/session/device', [VibyraAppController::class, 'updateAccountSessionDevice']);
Route::get('/api/account/sessions', [VibyraAppController::class, 'accountSessions']);
Route::delete('/api/account/devices/{deviceId}', [VibyraAppController::class, 'revokeAccountDevice']);
Route::delete('/api/account/sessions', [VibyraAppController::class, 'revokeAccountSessions']);
Route::delete('/api/account/sessions/{sessionId}', [VibyraAppController::class, 'revokeAccountSession']);
Route::delete('/api/account', [VibyraAppController::class, 'deleteAccount']);
Route::get('/api/session', [VibyraAppController::class, 'session']);
Route::post('/api/session/state', [VibyraAppController::class, 'saveState']);
Route::get('/api/project-memory/{projectId}', [VibyraAppController::class, 'projectMemory']);
Route::post('/api/project-memory/{projectId}/entries', [VibyraAppController::class, 'addProjectMemory']);
Route::delete('/api/project-memory/{projectId}/entries/{entryId}', [VibyraAppController::class, 'deleteProjectMemory']);
Route::get('/api/project-memory/{projectId}/vault', [VibyraAppController::class, 'projectMemoryVault']);
Route::post('/api/project-memory/{projectId}/nodes', [VibyraAppController::class, 'createProjectMemoryNode']);
Route::patch('/api/project-memory/{projectId}/nodes/{nodeId}', [VibyraAppController::class, 'updateProjectMemoryNode']);
Route::delete('/api/project-memory/{projectId}/nodes/{nodeId}', [VibyraAppController::class, 'deleteProjectMemoryNode']);
Route::post('/api/project-memory/{projectId}/imports', [VibyraAppController::class, 'importProjectMemory']);
Route::post('/api/onboarding/complete', [VibyraAppController::class, 'completeOnboarding']);
Route::post('/api/moderation', [VibyraAppController::class, 'moderate']);
Route::post('/api/chat', [VibyraAppController::class, 'chat']);
Route::post('/api/chat/route', [VibyraAppController::class, 'chatAutoRoute']);
Route::post('/api/chat/research-plan', [VibyraAppController::class, 'chatResearchPlan']);
Route::post('/api/chat/team-plan', [VibyraAppController::class, 'chatTeamPlan'])->middleware('throttle:12,1');
Route::post('/api/chat/stream', [VibyraAppController::class, 'chatStream']);
Route::post('/api/codex/responses', [VibyraAppController::class, 'codexResponses']);
Route::post('/api/terminal/anthropic/messages', [VibyraAppController::class, 'anthropicTerminalMessages']);
Route::post('/api/terminal/anthropic/messages/count_tokens', [VibyraAppController::class, 'anthropicTerminalCountTokens']);
Route::post('/api/terminal/gemini/models/{model}/{action}', [VibyraAppController::class, 'geminiTerminalRequest']);
Route::post('/api/chat/learning/feedback', [VibyraAppController::class, 'chatLearningFeedback']);
Route::post('/api/level/activity', [VibyraAppController::class, 'levelActivity']);
Route::get('/api/referrals/me', [VibyraAppController::class, 'referralSummary']);
Route::get('/api/skills', [VibyraAppController::class, 'skills']);
Route::get('/api/community/projects', [VibyraAppController::class, 'communityProjects']);
Route::get('/api/community/projects/{slug}/demo/{path?}', [VibyraAppController::class, 'communityProjectHostedDemo'])->where('path', '.*');
Route::get('/api/community/projects/{slug}/preview', [VibyraAppController::class, 'communityProjectPreview']);
Route::post('/api/community/projects/{slug}/comments', [VibyraAppController::class, 'commentOnCommunityProject']);
Route::post('/api/community/projects/{slug}/reaction', [VibyraAppController::class, 'reactToCommunityProject']);
Route::delete('/api/community/projects/{slug}/reaction', [VibyraAppController::class, 'removeCommunityProjectReaction']);
Route::post('/api/community/assets/generate', [VibyraAppController::class, 'generateCommunityAsset']);
Route::get('/api/projects/publish-status', [VibyraAppController::class, 'publishedProjectStatuses']);
Route::post('/api/projects/publish', [VibyraAppController::class, 'publishProject']);
Route::patch('/api/projects/{slug}/listing', [VibyraAppController::class, 'updatePublishedProjectListing']);
Route::patch('/api/projects/{slug}/publish', [VibyraAppController::class, 'updatePublishedProjectVisibility']);
Route::delete('/api/projects/{slug}/publish', [VibyraAppController::class, 'deletePublishedProject']);
Route::get('/api/projects/review-queue', [VibyraAppController::class, 'publishReviewQueue']);
Route::post('/api/projects/{slug}/review', [VibyraAppController::class, 'reviewPublishedProject']);
Route::get('/api/billing/plans', [BillingController::class, 'plans']);
Route::post('/api/billing/checkout', [BillingController::class, 'checkout']);
Route::post('/api/billing/portal', [BillingController::class, 'portal']);
Route::post('/api/billing/change', [BillingController::class, 'changeMembership']);
Route::post('/api/billing/cancel', [BillingController::class, 'cancelMembership']);
Route::post('/api/billing/iap-receipt', [BillingController::class, 'iapReceipt']);
Route::post('/api/billing/webhook', [BillingController::class, 'webhook']);
Route::options('/api/{any}', [VibyraAppController::class, 'options'])->where('any', '.*');

if (config('desktop.legacy_routes_enabled')) {
    Route::options('/{any}', [VibyraDesktopController::class, 'options'])->where('any', '.*');
}
