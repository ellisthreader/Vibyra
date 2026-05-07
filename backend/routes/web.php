<?php

use App\Http\Controllers\VibyraDesktopController;
use App\Http\Controllers\VibyraAppController;
use Illuminate\Support\Facades\Route;

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
Route::post('/commands/run', [VibyraDesktopController::class, 'runCommand']);

Route::post('/api/auth/signup', [VibyraAppController::class, 'signup']);
Route::post('/api/auth/login', [VibyraAppController::class, 'login']);
Route::get('/api/session', [VibyraAppController::class, 'session']);
Route::post('/api/session/state', [VibyraAppController::class, 'saveState']);
Route::post('/api/onboarding/complete', [VibyraAppController::class, 'completeOnboarding']);
Route::post('/api/moderation', [VibyraAppController::class, 'moderate']);
Route::post('/api/chat', [VibyraAppController::class, 'chat']);
Route::get('/api/skills', [VibyraAppController::class, 'skills']);
Route::options('/api/{any}', [VibyraAppController::class, 'options'])->where('any', '.*');
Route::options('/{any}', [VibyraDesktopController::class, 'options'])->where('any', '.*');
