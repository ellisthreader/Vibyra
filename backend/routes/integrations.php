<?php

use App\Http\Controllers\IntegrationsController;
use App\Http\Controllers\ShopifyIntegrationWebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/api/integrations/rpc', [IntegrationsController::class, 'rpc'])->middleware('throttle:90,1');
Route::get('/api/integrations/callback/{service}', [IntegrationsController::class, 'callback'])->middleware('throttle:60,1');

Route::post('/api/integrations/shopify/webhook', ShopifyIntegrationWebhookController::class)->middleware('throttle:120,1');
