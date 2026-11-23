<?php

use App\Http\Controllers\ActivityController;
use App\Http\Controllers\ActivityTemplateController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DailyLogController;
use App\Http\Controllers\TrackController;
use App\Http\Controllers\TrackProgressController;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login',    [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me',      [AuthController::class, 'me']);

    Route::apiResource('tracks', TrackController::class);

    Route::apiResource('tracks.activities', ActivityController::class)
        ->scoped();

    // Daily logs — overview (per track, per date)
    Route::get('tracks/{track}/daily-logs', [DailyLogController::class, 'overview']);

    // Daily logs — per activity (history, upsert, show, delete)
    Route::get('tracks/{track}/activities/{activity}/logs',              [DailyLogController::class, 'history']);
    Route::put('tracks/{track}/activities/{activity}/logs/{date}',       [DailyLogController::class, 'upsert']);
    Route::get('tracks/{track}/activities/{activity}/logs/{date}',       [DailyLogController::class, 'show']);
    Route::delete('tracks/{track}/activities/{activity}/logs/{date}',    [DailyLogController::class, 'destroy']);

    Route::get('/activity-templates', [ActivityTemplateController::class, 'index']);

    Route::get('tracks/{track}/progress',   [TrackProgressController::class, 'show']);
    Route::get('tracks/{track}/calendar',   [TrackProgressController::class, 'calendar']);
    Route::get('tracks/{track}/analytics',  [TrackProgressController::class, 'analytics']);
});
