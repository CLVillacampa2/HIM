<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('households', 'household_uuid')) {
            Schema::table('households', function (Blueprint $table) {
                $table->uuid('household_uuid')->nullable()->unique();
            });
        }

        foreach (DB::table('households')->whereNull('household_uuid')->pluck('id') as $id) {
            DB::table('households')->where('id', $id)->update(['household_uuid' => (string) Str::uuid()]);
        }

        if (! Schema::hasColumn('patients', 'patient_uuid')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->uuid('patient_uuid')->nullable()->unique();
            });
        }

        foreach (DB::table('patients')->whereNull('patient_uuid')->pluck('id') as $id) {
            DB::table('patients')->where('id', $id)->update(['patient_uuid' => (string) Str::uuid()]);
        }

        if (! Schema::hasColumn('patients', 'philhealth_id')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->string('philhealth_id', 30)->nullable()->unique();
            });
        }
        if (! Schema::hasColumn('patients', 'is_household_head')) {
            Schema::table('patients', function (Blueprint $table) {
                $table->boolean('is_household_head')->default(false);
            });
        }

        if (! Schema::hasColumn('vaccine_schedules', 'earliest_age_days')) {
            Schema::table('vaccine_schedules', function (Blueprint $table) {
                $table->unsignedSmallInteger('earliest_age_days')->default(0);
            });
        }
        if (! Schema::hasColumn('vaccine_schedules', 'latest_age_days')) {
            Schema::table('vaccine_schedules', function (Blueprint $table) {
                $table->unsignedSmallInteger('latest_age_days')->nullable();
            });
        }
        if (! Schema::hasColumn('vaccine_schedules', 'recommended_age_months')) {
            Schema::table('vaccine_schedules', function (Blueprint $table) {
                $table->unsignedTinyInteger('recommended_age_months')->nullable();
            });
        }

        if (Schema::hasColumn('vaccine_schedules', 'minimum_age_days')) {
            DB::table('vaccine_schedules')
                ->whereNotNull('minimum_age_days')
                ->update(['earliest_age_days' => DB::raw('minimum_age_days')]);
        }
        DB::table('vaccine_schedules')
            ->whereNull('latest_age_days')
            ->update(['latest_age_days' => DB::raw('recommended_age_days + 30')]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('vaccine_schedules', 'recommended_age_months')) {
            Schema::table('vaccine_schedules', fn (Blueprint $table) => $table->dropColumn('recommended_age_months'));
        }
        if (Schema::hasColumn('vaccine_schedules', 'latest_age_days')) {
            Schema::table('vaccine_schedules', fn (Blueprint $table) => $table->dropColumn('latest_age_days'));
        }
        if (Schema::hasColumn('vaccine_schedules', 'earliest_age_days')) {
            Schema::table('vaccine_schedules', fn (Blueprint $table) => $table->dropColumn('earliest_age_days'));
        }
        foreach (['philhealth_id', 'is_household_head', 'patient_uuid'] as $column) {
            if (Schema::hasColumn('patients', $column)) {
                Schema::table('patients', fn (Blueprint $table) => $table->dropColumn($column));
            }
        }
        if (Schema::hasColumn('households', 'household_uuid')) {
            Schema::table('households', fn (Blueprint $table) => $table->dropColumn('household_uuid'));
        }
    }
};