<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClinicalEncounter;
use App\Models\Household;
use App\Models\ImmunizationRecord;
use App\Models\Patient;
use App\Models\SyncLog;
use App\Models\VaccineSchedule;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;
use Throwable;

class SyncController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $batch = $request->validate([
            'device_id' => ['required', 'string', 'max:100'],
            'transactions' => ['required', 'array', 'min:1', 'max:100'],
            'transactions.*.transaction_id' => ['required', 'uuid'],
            'transactions.*.local_id' => ['required', 'string', 'max:100'],
            'transactions.*.entity_type' => ['required', 'in:household,patient,immunization,encounter'],
            'transactions.*.operation' => ['required', 'in:create,update,delete'],
            'transactions.*.entity_id' => ['nullable', 'uuid'],
            'transactions.*.base_updated_at' => ['nullable', 'date'],
            'transactions.*.payload' => ['required', 'array'],
        ]);

        $results = [];
        foreach ($batch['transactions'] as $item) {
            try {
                $results[] = $this->processTransaction($request, $batch['device_id'], $item);
            } catch (Throwable $exception) {
                report($exception);
                $results[] = [
                    'transaction_id' => $item['transaction_id'],
                    'local_id' => $item['local_id'],
                    'status' => 'retry',
                    'message' => 'The transaction could not be committed. It remains queued for retry.',
                ];
            }
        }

        $synced = collect($results)
            ->filter(fn (array $result): bool => in_array($result['status'], ['synced', 'duplicate'], true) || ($result['status'] === 'conflict' && isset($result['server_record'])))
            ->pluck('local_id')
            ->values();

        return response()->json([
            'results' => $results,
            'synced_local_ids' => $synced,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    private function processTransaction(Request $request, string $deviceId, array $item): array
    {
        return DB::transaction(function () use ($request, $deviceId, $item): array {
            $existingLog = SyncLog::query()
                ->where('client_device_id', $deviceId)
                ->where('client_transaction_id', $item['transaction_id'])
                ->first();

            if ($existingLog) {
                $metadata = $existingLog->result_metadata ?? [];

                return [
                    'transaction_id' => $item['transaction_id'],
                    'local_id' => $item['local_id'],
                    'status' => in_array($existingLog->status, ['synced', 'duplicate'], true) ? 'duplicate' : $existingLog->status,
                    ...$metadata,
                ];
            }

            $payload = $item['payload'];
            $log = SyncLog::create([
                'user_id' => $request->user()->id,
                'client_device_id' => $deviceId,
                'client_transaction_id' => $item['transaction_id'],
                'entity_type' => $item['entity_type'],
                'client_entity_id' => $item['entity_id'] ?? null,
                'operation' => $item['operation'],
                'status' => 'pending',
                'payload_hash' => hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR)),
            ]);

            try {
                if ($item['operation'] === 'delete' && $item['entity_type'] !== 'patient') {
                    throw ValidationException::withMessages(['operation' => ['Only patient records can be archived through sync.']]);
                }

                $outcome = match ($item['entity_type']) {
                    'household' => $this->syncHousehold($item, $payload),
                    'patient' => $this->syncPatient($item, $payload),
                    'immunization' => $this->syncImmunization($item, $payload, $request),
                    'encounter' => $this->syncEncounter($item, $payload, $request),
                };
            } catch (ValidationException $exception) {
                $errors = $exception->errors();
                $log->update([
                    'status' => 'rejected',
                    'error_message' => json_encode($errors, JSON_UNESCAPED_UNICODE),
                    'processed_at' => now(),
                ]);

                return [
                    'transaction_id' => $item['transaction_id'],
                    'local_id' => $item['local_id'],
                    'status' => 'rejected',
                    'errors' => $errors,
                ];
            }

            $status = $outcome['status'];
            $metadata = $outcome['metadata'];
            $log->update([
                'status' => $status,
                'result_metadata' => $metadata,
                'processed_at' => now(),
            ]);

            return [
                'transaction_id' => $item['transaction_id'],
                'local_id' => $item['local_id'],
                'status' => $status,
                ...$metadata,
            ];
        }, 3);
    }

    private function syncHousehold(array $item, array $payload): array
    {
        $householdUuid = $payload['household_uuid'] ?? $item['entity_id'] ?? null;
        $data = Validator::make($payload, [
            'household_uuid' => ['nullable', 'uuid'],
            'household_code' => ['nullable', 'string', 'max:40'],
            'region' => ['nullable', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'city_municipality' => ['nullable', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'purok_sitio' => ['nullable', 'string', 'max:100'],
            'street' => ['nullable', 'string', 'max:150'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'postal_code' => ['nullable', 'string', 'max:10'],
            'contact_number' => ['nullable', 'string', 'max:30'],
            'address_notes' => ['nullable', 'string', 'max:2000'],
        ])->validate();

        if (! $householdUuid || ! Str::isUuid($householdUuid)) {
            throw ValidationException::withMessages(['household_uuid' => ['A valid household UUID is required.']]);
        }

        $data['household_uuid'] = $householdUuid;
        $household = Household::query()->where('household_uuid', $householdUuid)->first();

        if ($household && $item['operation'] === 'update') {
            if ($this->isStale($household->updated_at, $item['base_updated_at'] ?? null)) {
                return $this->conflict($household->household_uuid, $household->updated_at, $household->only([
                    'household_uuid', 'household_code', 'region', 'province', 'city_municipality', 'barangay',
                    'purok_sitio', 'street', 'house_number', 'postal_code', 'contact_number', 'address_notes', 'updated_at',
                ]));
            }
            $household->update($data);
        } elseif (! $household) {
            $household = Household::create($data);
        } else {
            return $this->conflict($household->household_uuid, $household->updated_at, $household->only([
                'household_uuid', 'household_code', 'region', 'province', 'city_municipality', 'barangay',
                'purok_sitio', 'street', 'house_number', 'postal_code', 'contact_number', 'address_notes', 'updated_at',
            ]));
        }

        return $this->synced($household->household_uuid, $household->updated_at);
    }

    private function syncPatient(array $item, array $payload): array
    {
        $patientUuid = $payload['patient_uuid'] ?? $item['entity_id'] ?? null;
        $patient = $patientUuid ? Patient::query()->where('patient_uuid', $patientUuid)->first() : null;

        if ($item['operation'] === 'delete') {
            if (! $patient) {
                return $this->synced((string) $patientUuid, now());
            }
            if ($this->isStale($patient->updated_at, $item['base_updated_at'] ?? null)) {
                return $this->conflict($patient->patient_uuid, $patient->updated_at, $this->patientSnapshot($patient));
            }

            $patient->delete();

            return $this->synced($patient->patient_uuid, $patient->updated_at);
        }

        $philhealthRule = Rule::unique('patients', 'philhealth_id')->whereNull('deleted_at');
        if ($patient) {
            $philhealthRule->ignore($patient->id);
        }
        $data = Validator::make($payload, [
            'patient_uuid' => ['nullable', 'uuid'],
            'household_uuid' => ['nullable', 'uuid'],
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'suffix' => ['nullable', 'string', 'max:20'],
            'date_of_birth' => ['required', 'date', 'before_or_equal:today'],
            'sex_at_birth' => ['required', 'in:female,male,intersex,unknown'],
            'philhealth_id' => ['nullable', 'string', 'max:30', $philhealthRule],
            'is_household_head' => ['sometimes', 'boolean'],
            'contact_number' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:150'],
            'guardian_name' => ['nullable', 'string', 'max:200'],
            'guardian_relationship' => ['nullable', 'string', 'max:50'],
            'guardian_contact_number' => ['nullable', 'string', 'max:30'],
            'address_notes' => ['nullable', 'string', 'max:2000'],
        ])->validate();

        if (! $patientUuid || ! Str::isUuid($patientUuid)) {
            throw ValidationException::withMessages(['patient_uuid' => ['A valid patient UUID is required.']]);
        }

        $householdUuid = $data['household_uuid'] ?? null;
        unset($data['household_uuid']);
        $data['patient_uuid'] = $patientUuid;
        $data['household_id'] = $householdUuid
            ? Household::query()->where('household_uuid', $householdUuid)->value('id')
            : null;

        if ($householdUuid && ! $data['household_id']) {
            throw ValidationException::withMessages(['household_uuid' => ['Sync the household before linking a patient to it.']]);
        }
        if (($data['is_household_head'] ?? false) && ! $data['household_id']) {
            throw ValidationException::withMessages(['household_uuid' => ['A household head must be linked to a household.']]);
        }

        if ($patient && $item['operation'] === 'update') {
            if ($this->isStale($patient->updated_at, $item['base_updated_at'] ?? null)) {
                return $this->conflict($patient->patient_uuid, $patient->updated_at, $this->patientSnapshot($patient));
            }
            $patient->update($data);
        } elseif (! $patient) {
            if (! empty($data['is_household_head'])) {
                Patient::query()->where('household_id', $data['household_id'])->update(['is_household_head' => false]);
            }
            $patient = Patient::create($data);
        } else {
            return $this->conflict($patient->patient_uuid, $patient->updated_at, $this->patientSnapshot($patient));
        }

        return $this->synced($patient->patient_uuid, $patient->updated_at);
    }

    private function syncImmunization(array $item, array $payload, Request $request): array
    {
        $data = Validator::make($payload, [
            'patient_uuid' => ['required', 'uuid'],
            'vaccine_schedule_id' => ['required', 'integer', 'exists:vaccine_schedules,id'],
            'administered_at' => ['required', 'date', 'before_or_equal:now'],
            'dose_label' => ['nullable', 'string', 'max:50'],
            'lot_number' => ['nullable', 'string', 'max:100'],
            'vaccine_expiry_date' => ['nullable', 'date'],
            'administration_site' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ])->validate();

        $patient = Patient::query()->where('patient_uuid', $data['patient_uuid'])->first();
        if (! $patient) {
            throw ValidationException::withMessages(['patient_uuid' => ['Patient does not exist on the server; sync the patient first.']]);
        }

        $clientRecordId = $item['entity_id'] ?? $payload['client_record_id'] ?? (string) Str::uuid();
        $existingRecord = ImmunizationRecord::query()->where('client_record_id', $clientRecordId)->first();
        if ($existingRecord && ($existingRecord->patient_id !== $patient->id || $existingRecord->vaccine_schedule_id !== (int) $data['vaccine_schedule_id'])) {
            throw ValidationException::withMessages(['client_record_id' => ['This client record ID is already in use.']]);
        }

        $record = $existingRecord ?? ImmunizationRecord::query()->firstOrCreate(
            ['client_record_id' => $clientRecordId],
            [
                ...$data,
                'client_record_id' => $clientRecordId,
                'patient_id' => $patient->id,
                'administered_by' => $request->user()->id,
            ],
        );

        return $this->synced((string) $record->client_record_id, $record->updated_at);
    }

    private function syncEncounter(array $item, array $payload, Request $request): array
    {
        $data = Validator::make($payload, [
            'patient_uuid' => ['required', 'uuid'],
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
            'diagnoses' => ['sometimes', 'array', 'max:20'],
            'diagnoses.*.icd10_code_id' => ['required', 'integer', 'distinct', 'exists:icd10_codes,id'],
            'diagnoses.*.is_primary' => ['sometimes', 'boolean'],
            'diagnoses.*.diagnosis_notes' => ['nullable', 'string', 'max:1000'],
        ])->validate();

        $patient = Patient::query()->where('patient_uuid', $data['patient_uuid'])->first();
        if (! $patient) {
            throw ValidationException::withMessages(['patient_uuid' => ['Patient does not exist on the server; sync the patient first.']]);
        }

        $encounterUuid = $item['entity_id'] ?? $payload['client_encounter_id'] ?? (string) Str::uuid();
        $existing = ClinicalEncounter::query()->where('client_encounter_id', $encounterUuid)->first();
        if ($existing) {
            return $existing->patient_id === $patient->id
                ? $this->synced((string) $existing->client_encounter_id, $existing->updated_at)
                : $this->conflict((string) $existing->client_encounter_id, $existing->updated_at);
        }

        $diagnoses = $data['diagnoses'] ?? [];
        if (collect($diagnoses)->filter(fn (array $diagnosis): bool => filter_var($diagnosis['is_primary'] ?? false, FILTER_VALIDATE_BOOLEAN))->count() > 1) {
            throw ValidationException::withMessages(['diagnoses' => ['Only one diagnosis may be marked primary.']]);
        }
        unset($data['diagnoses'], $data['patient_uuid']);
        $encounter = ClinicalEncounter::create([
            ...$data,
            'client_encounter_id' => $encounterUuid,
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

        return $this->synced((string) $encounter->client_encounter_id, $encounter->updated_at);
    }

    private function isStale(mixed $serverUpdatedAt, ?string $baseUpdatedAt): bool
    {
        return ! $baseUpdatedAt || $serverUpdatedAt->gt($baseUpdatedAt);
    }

    private function synced(string $serverId, mixed $updatedAt): array
    {
        return [
            'status' => 'synced',
            'metadata' => ['server_entity_id' => $serverId, 'server_updated_at' => $updatedAt?->toIso8601String()],
        ];
    }

    private function conflict(string $serverId, mixed $updatedAt, ?array $serverRecord = null): array
    {
        $metadata = ['server_entity_id' => $serverId, 'server_updated_at' => $updatedAt?->toIso8601String()];
        if ($serverRecord !== null) {
            $metadata['server_record'] = $serverRecord;
        }

        return [
            'status' => 'conflict',
            'metadata' => $metadata,
        ];
    }

    private function patientSnapshot(Patient $patient): array
    {
        $patient->loadMissing('household');
        $snapshot = $patient->only([
            'patient_uuid', 'patient_number', 'qr_code_token', 'first_name', 'middle_name', 'last_name', 'suffix',
            'date_of_birth', 'sex_at_birth', 'philhealth_id', 'is_household_head', 'contact_number', 'email',
            'guardian_name', 'guardian_relationship', 'guardian_contact_number', 'address_notes', 'household_id', 'updated_at',
        ]);
        $snapshot['household_uuid'] = $patient->household?->household_uuid;

        return $snapshot;
    }
}
