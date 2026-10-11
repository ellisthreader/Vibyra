<?php
use App\Http\Controllers\AgentsV2\{ChannelsController,ChannelHooksController};
use App\Http\Middleware\{AgentV2Credentials,RequireApprovedMarket};
use Illuminate\Support\Facades\Route;
Route::prefix('api/agents/v2')->middleware(['throttle:120,1,agent-channels',AgentV2Credentials::class.':user'])->group(function(){
    Route::get('channels',[ChannelsController::class,'index']);
    Route::post('channels/slack/connect',[ChannelsController::class,'connect'])->middleware(RequireApprovedMarket::class);
    Route::post('channels/identities',[ChannelsController::class,'identity'])->middleware(RequireApprovedMarket::class);
    Route::get('channels/audiences',[ChannelsController::class,'audiences']);
    Route::get('channels/{id}',[ChannelsController::class,'show'])->whereUuid('id');
    Route::put('channels/{id}',[ChannelsController::class,'save'])->whereUuid('id')->middleware(RequireApprovedMarket::class);
    Route::delete('channels/{id}',[ChannelsController::class,'delete'])->whereUuid('id');
    Route::get('channels/{id}/threads',[ChannelsController::class,'threads'])->whereUuid('id');
    Route::get('channel-threads/{id}',[ChannelsController::class,'thread'])->whereUuid('id');
});
Route::post('api/agents/v2/channel-hooks/slack',[ChannelHooksController::class,'slack'])->middleware('throttle:600,1,agent-channel-slack');
