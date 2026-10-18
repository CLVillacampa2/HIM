<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PatientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'household_id' => ['nullable', 'integer', 'exists:households,id'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $patients = Patient::query()
            ->with('household')
            ->when($validated['household_id'] ?? null, fn ($query, $id) => $query->where('household_id', $id))
            ->when($validated['q'] ?? null, function ($query, string $term): void {
                $query->where(function ($query) use ($term): void {
                    $query->where('patient_number', 'like', "%{$term}%")
                        ->orWhere('first_name', 'like', "%{$term}%")
                        ->orWhere('middle_name', 'like', "%{$term}%")
                        ->orWhere('last_name', 'like', "%{$term}%")
                        ->orWhere('contact_number', 'like', "%{$term}%");
                });
            })
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->paginate($validated['per_page'] ?? 25);

        return response()->json($patients);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatedPatient($request);

        $patient = DB::transaction(function () use ($data): Patient {
            if (($data['is_household_head'] ?? false) && ! empty($data['household_id'])) {
                Patient::query()->where('household_id', $data['household_id'])->update(['is_household_head' => false]);
            }

            return Patient::create($data);
        });

        return response()->json($patient->load('household'), 201);
    }

    public function show(Patient $patient): JsonResponse
    {
        return response()->json($patient->load([
            'household',
            'immunizationRecords.schedule',
            'clinicalEncounters.attendingUser',
            'clinicalEncounters.diagnoses',
        ]));
    }

    public function update(Request $request, Patient $patient): JsonResponse
    {
        $data = $this->validatedPatient($request, $patient);

        DB::transaction(function () use ($data, $patient): void {
            if (($data['is_household_head'] ?? false) && ! empty($data['household_id'])) {
                Patient::query()
                    ->where('household_id', $data['household_id'])
                    ->where('id', '<>', $patient->getKey())
                    ->update(['is_household_head' => false]);
            }

            $patient->update($data);
        });

        return response()->json($patient->fresh()->load('household'));
    }

    public function destroy(Patient $patient): JsonResponse
    {
        $patient->delete();

        return response()->json(['message' => 'Patient archived.']);
    }

    private function validatedPatient(Request $request, ?Patient $patient = null): array
    {
        $philhealthRule = Rule::unique('patients', 'philhealth_id')->whereNull('deleted_at');
        if ($patient) {
            $philhealthRule->ignore($patient->getKey());
        }

        $data = $request->validate([
            'household_id' => ['nullable', 'integer', 'exists:households,id'],
            'patient_uuid' => ['sometimes', 'uuid', Rule::unique('patients', 'patient_uuid')->ignore($patient?->getKey())],
            'patient_number' => ['sometimes', 'string', 'max:40', Rule::unique('patients', 'patient_number')->ignore($patient?->getKey())],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'suffix' => ['nullable', 'string', 'max:20'],
            'date_of_birth' => ['required', 'date', 'before_or_equal:today'],
            'sex_at_birth' => ['required', Rule::in(['female', 'male', 'intersex', 'unknown'])],
            'philhealth_id' => ['nullable', 'string', 'max:30', $philhealthRule],
            'is_household_head' => ['sometimes', 'boolean'],
            'contact_number' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:150'],
            'guardian_name' => ['nullable', 'string', 'max:200'],
            'guardian_relationship' => ['nullable', 'string', 'max:50'],
            'guardian_contact_number' => ['nullable', 'string', 'max:30'],
            'address_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        if (($data['is_household_head'] ?? false) && empty($data['household_id'])) {
            abort(response()->json(['message' => 'A household head must be linked to a household.'], 422));
        }

        return $data;
    }
}
