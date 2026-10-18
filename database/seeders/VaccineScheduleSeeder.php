<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class VaccineScheduleSeeder extends Seeder
{
    public function run(): void
    {
        // Starting points reflect the routine infant schedule commonly used in the Philippine EPI.
        // Confirm the active DOH/NIP circular and local catch-up rules before clinical deployment.
        $schedule = [
            ['BCG', 'BCG', 1, 0, 0, null, null],
            ['HEPB', 'Hepatitis B', 1, 0, 0, null, null],
            ['PENTA', 'Pentavalent', 1, 42, 42, null, null],
            ['PENTA', 'Pentavalent', 2, 70, 70, null, 28],
            ['PENTA', 'Pentavalent', 3, 98, 98, null, 28],
            ['OPV', 'Oral Polio Vaccine', 1, 42, 42, null, null],
            ['OPV', 'Oral Polio Vaccine', 2, 70, 70, null, 28],
            ['OPV', 'Oral Polio Vaccine', 3, 98, 98, null, 28],
            ['IPV', 'Inactivated Polio Vaccine', 1, 98, 98, null, null],
            ['IPV', 'Inactivated Polio Vaccine', 2, 274, 274, 9, 180],
            ['PCV', 'Pneumococcal Conjugate Vaccine', 1, 42, 42, null, null],
            ['PCV', 'Pneumococcal Conjugate Vaccine', 2, 70, 70, null, 28],
            ['PCV', 'Pneumococcal Conjugate Vaccine', 3, 98, 98, null, 28],
            ['MMR', 'Measles, Mumps, Rubella', 1, 274, 274, 9, null],
            ['MMR', 'Measles, Mumps, Rubella', 2, 365, 365, 12, 91],
        ];

        $rows = array_map(static function (array $dose): array {
            [$code, $name, $number, $age, $earliest, $ageMonths, $minimumInterval] = $dose;

            return [
                'vaccine_code' => $code,
                'vaccine_name' => $name,
                'dose_number' => $number,
                'earliest_age_days' => $earliest,
                'recommended_age_days' => $age,
                'latest_age_days' => $age + 30,
                'recommended_age_months' => $ageMonths,
                'minimum_interval_days' => $minimumInterval,
                'dose_label' => 'Dose '.$number,
                'notes' => 'Routine schedule seed; verify current DOH guidance before use.',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }, $schedule);

        DB::table('vaccine_schedules')->upsert(
            $rows,
            ['vaccine_code', 'dose_number'],
            ['vaccine_name', 'earliest_age_days', 'recommended_age_days', 'latest_age_days', 'recommended_age_months', 'minimum_interval_days', 'dose_label', 'notes', 'is_active', 'updated_at'],
        );
    }
}
