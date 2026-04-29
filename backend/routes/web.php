<?php

use App\Http\Controllers\CodeXDesktopController;
use Illuminate\Support\Facades\Route;

Route::get('/', [CodeXDesktopController::class, 'app']);
Route::get('/desktop', [CodeXDesktopController::class, 'app']);
Route::get('/desktop/state', [CodeXDesktopController::class, 'state']);
Route::post('/desktop/approve', [CodeXDesktopController::class, 'approve']);
Route::post('/desktop/deny', [CodeXDesktopController::class, 'deny']);

Route::get('/health', [CodeXDesktopController::class, 'health']);
Route::post('/pair', [CodeXDesktopController::class, 'pair']);
Route::get('/pair/status', [CodeXDesktopController::class, 'pairStatus']);
Route::get('/projects', [CodeXDesktopController::class, 'projects']);
Route::get('/events', [CodeXDesktopController::class, 'events']);
Route::post('/preview/start', [CodeXDesktopController::class, 'startPreview']);
Route::post('/agents/start', [CodeXDesktopController::class, 'startAgent']);
Route::post('/commands/run', [CodeXDesktopController::class, 'runCommand']);
Route::options('/{any}', [CodeXDesktopController::class, 'options'])->where('any', '.*');
