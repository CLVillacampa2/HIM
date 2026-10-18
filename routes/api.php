<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ClinicalEncounterController;
use App\Http\Controllers\Api\V1\HouseholdController;
use App\Http\Controllers\Api\V1\ImmunizationController;
use App\Http\Controllers\Api\V1\PatientController;
use App\Http\Controllers\Api\V1\SyncController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::post('/auth/token', [AuthController::class, 'login'])->middleware('throttle:5,1');

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::apiResource('patients', PatientController::class);
        Route::get('/households', [HouseholdController::class, 'index']);
        Route::post('/households', [HouseholdController::class, 'store']);
        Route::get('/households/{household}', [HouseholdController::class, 'show']);
        Route::get('/vaccine-schedules', [ImmunizationController::class, 'vaccineSchedules']);

        Route::get('/patients/{patient}/immunizations/schedule', [ImmunizationController::class, 'schedule']);
        Route::post('/patients/{patient}/immunizations', [ImmunizationController::class, 'record']);
        Route::get('/patients/{patient}/immunizations/reminder-payload', [ImmunizationController::class, 'reminderPayload']);

        Route::get('/patients/{patient}/encounters', [ClinicalEncounterController::class, 'index']);
        Route::post('/patients/{patient}/encounters', [ClinicalEncounterController::class, 'store']);
        Route::get('/icd10', [ClinicalEncounterController::class, 'searchIcd10']);
        Route::get('/icd10/catalog', [ClinicalEncounterController::class, 'icd10Catalog']);
        Route::get('/reports/fhsis/diagnoses', [ClinicalEncounterController::class, 'fhsisDiagnosisSummary']);

        Route::post('/sync', SyncController::class)->middleware('throttle:60,1');
    });
});
