<?php

use App\Http\Controllers\InfrastructureReadinessController;
use App\Http\Middleware\VibyraCors;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            Route::get('/ready', InfrastructureReadinessController::class);
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Versioned state comparisons require exact JSON values, including
        // whitespace and empty strings. Legacy saves keep their old behavior.
        $exactStateSync = fn (Request $request): bool => $request->is('api/session/state/delta')
            || ($request->is('api/session/state') && $request->input('responseMode') === 'ack-v1');
        $middleware->trimStrings(except: [$exactStateSync]);
        $middleware->convertEmptyStringsToNull(except: [$exactStateSync]);
        // Railway terminates TLS at its edge and forwards plain HTTP, so
        // without this every generated URL comes out `http://` — including the
        // download URL handed to the desktop updater, which then takes an
        // extra redirect to fetch a 98 MB package it was told to trust.
        $middleware->trustProxies(at: '*');
        $middleware->remove(HandleCors::class);
        $middleware->append(VibyraCors::class);
        $middleware->validateCsrfTokens(except: [
            'pair',
            'pair/status',
            'desktop/*',
            'projects',
            'projects/create',
            'files',
            'files/create',
            'files/read',
            'events',
            'preview/start',
            'agents/start',
            'agents/apply',
            'agents/discard',
            'commands/run',
            'api/*',
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->respond(fn ($response) => VibyraCors::withCorsHeaders($response, request()));
    })->create();
