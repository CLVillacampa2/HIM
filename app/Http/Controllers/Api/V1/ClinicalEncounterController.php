<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClinicalEncounter;
use App\Models\Icd10Code;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ClinicalEncounterController extends Controller
{
    public function index(Patient $patient): JsonResponse
    {
        return response()->json($patient->clinicalEncounters()
            ->with(['attendingUser:id,name', 'diagnoses:id,code,description'])
            ->latest('encountered_at')
            ->paginate(20));
    }

    public function store(Request $request, Patient $patient): JsonResponse
    {
        $data = $request->validate([
            'client_encounter_id' => ['nullable', 'uuid'],
            'encountered_at' => ['required', 'date', 'before_or_equal:now'],
            'encounter_type' => ['nullable', 'string', 'max:50'],
            'chief_complaint' => ['nullable', 'string', 'max:500'],
            'clinical_notes' => ['nullable', 'string', 'max:10000'],
            'temperature_celsius' => ['nullable', 'numeric', 'between:25,45'],
            'systolic_bp' => ['nullable', 'integer', 'between:40,300'],
            'diastolic_bp' => ['nullable', 'integer', 'between:20,200'],
            'pulse_rate' => ['nullable', 'integer', 'between:20,250'],
            'respiratory_rate' => ['nullable', 'integer', 'between:5,100'],
            'oxygen_saturation' => ['nullable', 'numeric', 'between:0,100'],
            'weight_kg' => ['nullable', 'numeric', 'between:0.1,500'],
            'height_cm' => ['nullable', 'numeric', 'between:20,250'],
            'follow_up_at' => ['nullable', 'date'],
            'diagnoses' => ['sometimes', 'array', 'max:20'],
            'diagnoses.*.icd10_code_id' => ['required', 'integer', 'distinct', 'exists:icd10_codes,id'],
            'diagnoses.*.is_primary' => ['sometimes', 'boolean'],
            'diagnoses.*.diagnosis_notes' => ['nullable', 'string', 'max:1000'],
        ]);

        if (collect($data['diagnoses'] ?? [])->filter(fn (array $diagnosis): bool => filter_var($diagnosis['is_primary'] ?? false, FILTER_VALIDATE_BOOLEAN))->count() > 1) {
            return response()->json(['message' => 'Only one diagnosis may be marked primary.'], 422);
        }

        $encounterId = $data['client_encounter_id'] ?? (string) Str::uuid();
        $encounter = DB::transaction(function () use ($data, $encounterId, $patient, $request): ClinicalEncounter {
            $existing = ClinicalEncounter::query()->where('client_encounter_id', $encounterId)->first();
            if ($existing) {
                abort_if($existing->patient_id !== $patient->id, 409, 'This client encounter ID belongs to a different patient.');

                return $existing->load('diagnoses');
            }

            $diagnoses = $data['diagnoses'] ?? [];
            unset($data['diagnoses']);

            $encounter = ClinicalEncounter::create([
                ...$data,
                'client_encounter_id' => $encounterId,
                'patient_id' => $patient->id,
                'attending_user_id' => $request->user()->id,
                'encounter_type' => $data['encounter_type'] ?? 'consultation',
            ]);

            $hasPrimary = collect($diagnoses)->contains(fn (array $diagnosis): bool => filter_var($diagnosis['is_primary'] ?? false, FILTER_VALIDATE_BOOLEAN));
            foreach ($diagnoses as $index => $diagnosis) {
                $encounter->diagnoses()->attach($diagnosis['icd10_code_id'], [
                    'is_primary' => filter_var($diagnosis['is_primary'] ?? false, FILTER_VALIDATE_BOOLEAN) || (! $hasPrimary && $index === 0),
                    'diagnosis_notes' => $diagnosis['diagnosis_notes'] ?? null,
                ]);
            }

            return $encounter->load('diagnoses');
        });

        return response()->json($encounter, $encounter->wasRecentlyCreated ? 201 : 200);
    }

    public function searchIcd10(Request $request): JsonResponse
    {
        $data = $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']]);
        $term = trim($data['q']);

        $codes = Icd10Code::query()
            ->where('is_active', true)
            ->where(function ($query) use ($term): void {
                $query->where('code', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%")
                    ->orWhere('category', 'like', "%{$term}%");
            })
            ->orderBy('code')
            ->limit(20)
            ->get(['id', 'code', 'description', 'category']);

        return response()->json(['data' => $codes]);
    }

    public function icd10Catalog(): JsonResponse
    {
        return response()->json(['data' => Icd10Code::query()
            ->where('is_active', true)
            ->orderBy('code')
            ->limit(1000)
            ->get(['id', 'code', 'description', 'category'])]);
    }

    public function fhsisDiagnosisSummary(Request $request): JsonResponse
    {
        $period = $request->validate([
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
        ]);

        $rows = DB::table('clinical_encounters as ce')
            ->join('clinical_encounter_diagnoses as ced', 'ced.clinical_encounter_id', '=', 'ce.id')
            ->join('icd10_codes as icd', 'icd.id', '=', 'ced.icd10_code_id')
            ->whereBetween('ce.encountered_at', [$period['from'].' 00:00:00', $period['to'].' 23:59:59'])
            ->select('icd.code', 'icd.description', DB::raw('COUNT(DISTINCT ce.id) as encounter_count'))
            ->selectRaw('SUM(CASE WHEN ced.is_primary = 1 THEN 1 ELSE 0 END) as primary_diagnosis_count')
            ->groupBy('icd.code', 'icd.description')
            ->orderBy('icd.code')
            ->get();

        return response()->json([
            'report' => 'FHSIS diagnosis summary (working layout)',
            'period' => $period,
            'generated_at' => now()->toIso8601String(),
            'data' => $rows,
            'notice' => 'Map and validate this dataset against the current DOH FHSIS form before official submission.',
        ]);
    }
}
