<?php
use App\Http\Controllers\AgentsV2\OrganisationController;
use App\Http\Middleware\{AgentV2Credentials, RequireApprovedMarket};
use Illuminate\Support\Facades\Route;
Route::prefix('api/agents/v2/organisation')->middleware([RequireApprovedMarket::class,
    AgentV2Credentials::class.':user', 'throttle:120,1,agent-organisation'])->group(function (): void {
    Route::get('/', [OrganisationController::class, 'index']);
    Route::put('policy', [OrganisationController::class, 'policy']);
    Route::get('audit', [OrganisationController::class, 'audit']);
    Route::put('definitions/{id}', [OrganisationController::class, 'put'])->whereUuid('id');
    Route::delete('definitions/{id}', [OrganisationController::class, 'destroy'])->whereUuid('id');
    Route::post('definitions/{id}/use', [OrganisationController::class, 'adopt'])->whereUuid('id');
});
