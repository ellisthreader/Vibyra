<?php

use App\Http\Controllers\AgentsV2\LocalMcpController;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;

/*
 * Roadmap Part 6: local (stdio) MCP servers. The Mac registers an opaque id, a name and the tool catalogue; teammates
 * reach the server through the leased Mac like computer and browser tools. Contract: docs/agent-v2-api-contract.md §6g.
 */
Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class])->group(function (): void {
    Route::middleware(['throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
        Route::get('local-mcp', [LocalMcpController::class, 'index']);
        Route::post('local-mcp/servers', [LocalMcpController::class, 'store'])->middleware('throttle:30,1,agent-v2-local-mcp');
        Route::get('local-mcp/servers/{id}', [LocalMcpController::class, 'show'])->whereUuid('id');
        Route::post('local-mcp/servers/{id}/approve', [LocalMcpController::class, 'approve'])->whereUuid('id');
        Route::put('local-mcp/servers/{id}/reads', [LocalMcpController::class, 'reads'])->whereUuid('id');
        Route::delete('local-mcp/servers/{id}', [LocalMcpController::class, 'destroy'])->whereUuid('id')
            ->withoutMiddleware(RequireApprovedMarket::class);
    });
    Route::prefix('runner/{runtime}')->whereUuid('runtime')->middleware(['throttle:600,1,agent-v2-runner', AgentV2Credentials::class.':runner'])->group(function (): void {
        Route::get('runs/{run}/local-mcp', [LocalMcpController::class, 'actions'])->whereUuid('run');
        Route::post('runs/{run}/local-mcp/{action}/claim', [LocalMcpController::class, 'claim'])->whereUuid('run')->whereUuid('action');
        Route::post('runs/{run}/local-mcp/{action}/receipt', [LocalMcpController::class, 'receipt'])->whereUuid('run')->whereUuid('action');
    });
});
