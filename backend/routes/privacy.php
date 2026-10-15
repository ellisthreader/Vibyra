<?php

use App\Http\Controllers\Privacy\PrivacyController as P;
use Illuminate\Support\Facades\Route;

/*
 * The same actions answer to the app session on /api and to the browser session on /web-api; the signed download needs neither.
 */
Route::get('api/account/export', [P::class, 'exportStatus'])->middleware('throttle:60,1,account-export-read');
Route::post('api/account/export', [P::class, 'exportRequest'])->middleware('throttle:10,60,account-export-request');
Route::get('account-export/{export}/download', [P::class, 'download'])->whereUuid('export')->name('account-export.download')
    ->middleware(['signed', 'throttle:20,1,account-export-download']);

Route::middleware(['web', 'auth'])->group(function (): void {
    Route::get('web-api/account/export', [P::class, 'exportStatus'])->middleware('throttle:60,1,account-export-read');
    Route::post('web-api/account/export', [P::class, 'exportRequest'])->middleware('throttle:10,60,account-export-request');
});
