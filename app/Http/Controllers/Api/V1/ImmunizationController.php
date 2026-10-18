<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ImmunizationRecord;
use App\Models\Patient;
use App\Models\VaccineSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ImmunizationController extends Controller
{
    public function vaccineSchedules(): JsonResponse
    {
        return response()->json(['data' => VaccineSchedule::query()
            ->where('is_active', true)
            ->orderBy('recommended_age_days')
            ->orderBy('vaccine_code')
            ->orderBy('dose_number')
            ->get()]);
    }

    public function schedule(Patient $patient): JsonResponse
    {
        $today = CarbonImmutable::today(config('app.timezone'));
        $birthDate = CarbonImmutable::parse($patient->date_of_birth->toDateString());
        $records = $patient->immunizationRecords()
            ->with('administrator:id,name')
            ->orderBy('administered_at')
            ->get()
            ->groupBy('vaccine_schedule_id');

        $doses = VaccineSchedule::query()
            ->where('is_active', true)
            ->orderBy('recommended_age_days')
            ->orderBy('vaccine_code')
            ->orderBy('dose_number')
            ->get();
        $schedule = $doses->map(function (VaccineSchedule $dose) use ($today, $birthDate, $records, $doses): array {
                $baseDueDate = $dose->recommended_age_months
                    ? $birthDate->addMonthsNoOverflow($dose->recommended_age_months)
                    : $birthDate->addDays($dose->recommended_age_days);
                $record = $records->get($dose->id)?->first();
                $previousDose = $doses->first(fn (VaccineSchedule $candidate): bool =>
                    $candidate->vaccine_code === $dose->vaccine_code && $candidate->dose_number === $dose->dose_number - 1
                );
                $previousRecord = $previousDose ? $records->get($previousDose->id)?->last() : null;
                $dueDate = $baseDueDate;

                if ($previousRecord && $dose->minimum_interval_days) {
                    $intervalDate = CarbonImmutable::parse($previousRecord->administered_at)->addDays($dose->minimum_interval_days);
                    if ($intervalDate->gt($dueDate)) {
                        $dueDate = $intervalDate;
                    }
                }

                $windowStart = $dueDate->gt($birthDate->addDays($dose->earliest_age_days))
                    ? $dueDate
                    : $birthDate->addDays($dose->earliest_age_days);
                $windowEnd = $dueDate->addDays(30);

                $status = match (true) {
                    $record !== null => 'completed',
                    $today->lt($windowStart) => 'upcoming',
                    $today->gt($windowEnd) => 'overdue',
                    default => 'due_today',
                };

                return [
                    'schedule_id' => $dose->id,
                    'vaccine_code' => $dose->vaccine_code,
                    'vaccine_name' => $dose->vaccine_name,
                    'dose_number' => $dose->dose_number,
                    'dose_label' => $dose->dose_label,
                    'due_date' => $dueDate->toDateString(),
                    'window_start' => $windowStart->toDateString(),
                    'window_end' => $windowEnd->toDateString(),
                    'status' => $status,
                    'record' => $record ? [
                        'id' => $record->id,
                        'client_record_id' => $record->client_record_id,
                        'administered_at' => $record->administered_at,
                        'lot_number' => $record->lot_number,
                        'administrator' => $record->administrator?->name,
                    ] : null,
                ];
            });

        return response()->json([
            'patient_uuid' => $patient->patient_uuid,
            'date_of_birth' => $birthDate->toDateString(),
            'as_of' => $today->toDateString(),
            'schedule' => $schedule,
        ]);
    }

    public function record(Request $request, Patient $patient): JsonResponse
    {
        $data = $request->validate([
            'client_record_id' => ['nullable', 'uuid'],
            'vaccine_schedule_id' => ['required', 'integer', Rule::exists('vaccine_schedules', 'id')->where('is_active', true)],
            'administered_at' => ['required', 'date', 'before_or_equal:now'],
            'dose_label' => ['nullable', 'string', 'max:50'],
            'lot_number' => ['nullable', 'string', 'max:100'],
            'vaccine_expiry_date' => ['nullable', 'date'],
            'administration_site' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $idempotencyId = $data['client_record_id'] ?? (string) Str::uuid();
        $record = DB::transaction(function () use ($data, $idempotencyId, $patient, $request): ImmunizationRecord {
            $record = ImmunizationRecord::query()->firstOrCreate(
                ['client_record_id' => $idempotencyId],
                [
                    ...$data,
                    'client_record_id' => $idempotencyId,
                    'patient_id' => $patient->id,
                    'administered_by' => $request->user()->id,
                ],
            );

            abort_if(
                $record->patient_id !== $patient->id || $record->vaccine_schedule_id !== (int) $data['vaccine_schedule_id'],
                409,
                'This client record ID is already associated with another immunization.',
            );

            return $record;
        });

        return response()->json($record->load(['schedule', 'administrator:id,name']), $record->wasRecentlyCreated ? 201 : 200);
    }

    public function reminderPayload(Patient $patient): JsonResponse
    {
        $schedule = $this->schedule($patient)->getData(true)['schedule'];
        $pending = collect($schedule)->whereIn('status', ['due_today', 'overdue'])->values();
        $phone = $patient->guardian_contact_number ?: $patient->contact_number;

        if (! $phone || $pending->isEmpty()) {
            return response()->json([
                'sendable' => false,
                'reason' => ! $phone ? 'No guardian or patient contact number is on file.' : 'No due or overdue vaccine doses.',
                'recipient' => $phone,
                'doses' => $pending,
            ]);
        }

        $doseNames = $pending->map(fn (array $dose): string => $dose['vaccine_name'].' '.$dose['dose_number'])->implode(', ');
        $firstName = $patient->guardian_name ? 'your child' : $patient->first_name;

        return response()->json([
            'sendable' => true,
            'channel' => 'sms',
            'recipient' => $phone,
            'patient_uuid' => $patient->patient_uuid,
            'dose_schedule_ids' => $pending->pluck('schedule_id')->all(),
            'message' => "Barangay Health Center reminder: {$firstName} has a vaccine dose due. Please visit your health center for {$doseNames}. Reply to your BHW for assistance.",
        ]);
    }
}
