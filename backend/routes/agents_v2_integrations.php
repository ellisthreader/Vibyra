<?php

use App\Http\Controllers\AgentsV2\{IntegrationsController, McpServersController};
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Support\Facades\Route;

/*
 * Agent V2 Phase 6 (rebuild Stage 3): integration catalogue readiness, remote MCP
 * servers and Composio account linking. Contract: docs/agent-v2-api-contract.md §5b.
 * The two callbacks and the client metadata document are public (single-use state).
 */
Route::prefix('api/agents/v2')->middleware([RequireApprovedMarket::class])->group(function (): void {
    Route::middleware(['throttle:120,1,agent-v2', AgentV2Credentials::class.':user'])->group(function (): void {
        Route::get('catalogue', [IntegrationsController::class, 'catalogue']);
        Route::post('composio/{toolkit}/start', [IntegrationsController::class, 'composioStart'])
            ->where('toolkit', '[a-z0-9]{2,40}')->middleware('throttle:10,1,agent-v2-connect');
        Route::post('mcp/servers', [McpServersController::class, 'store'])->middleware('throttle:10,1,agent-v2-connect');
        Route::get('mcp/servers/{id}', [McpServersController::class, 'show'])->whereUuid('id');
        Route::post('mcp/servers/{id}/signin', [McpServersController::class, 'signin'])->whereUuid('id')
            ->middleware('throttle:10,1,agent-v2-connect');
        Route::post('mcp/servers/{id}/refresh', [McpServersController::class, 'refresh'])->whereUuid('id')
            ->middleware('throttle:20,1,agent-v2-connect');
        Route::post('mcp/servers/{id}/approve', [McpServersController::class, 'approve'])->whereUuid('id');
        Route::put('mcp/servers/{id}/reads', [McpServersController::class, 'reads'])->whereUuid('id');
    });
});
// The callbacks read the flow's binding cookie (set by ConnectorHopController, which runs in the web group, so the
// browser returns it encrypted): these plain routes decrypt it with the same middleware.
Route::prefix('api/agents/v2')->middleware('throttle:60,1,agent-v2-callback')->group(function (): void {
    Route::get('mcp/callback', [McpServersController::class, 'callback'])->middleware(EncryptCookies::class);
    Route::get('mcp/client-metadata.json', [McpServersController::class, 'clientMetadata']);
    Route::get('composio/callback', [IntegrationsController::class, 'composioCallback'])->middleware(EncryptCookies::class);
});
