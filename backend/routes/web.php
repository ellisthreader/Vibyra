<?php

use App\Http\Controllers\VibyraDesktopController;
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
Route::get('/files', [VibyraDesktopController::class, 'files']);
Route::post('/files/create', [VibyraDesktopController::class, 'createFile']);
Route::get('/files/read', [VibyraDesktopController::class, 'readFile']);
Route::get('/events', [VibyraDesktopController::class, 'events']);
Route::post('/preview/start', [VibyraDesktopController::class, 'startPreview']);
Route::post('/agents/start', [VibyraDesktopController::class, 'startAgent']);
Route::post('/commands/run', [VibyraDesktopController::class, 'runCommand']);
Route::options('/{any}', [VibyraDesktopController::class, 'options'])->where('any', '.*');
