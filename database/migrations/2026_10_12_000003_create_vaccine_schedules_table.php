<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vaccine_schedules', function (Blueprint $table) {
            $table->id();
            $table->string('vaccine_code', 30);
            $table->string('vaccine_name', 100);
            $table->unsignedSmallInteger('dose_number');
            $table->unsignedSmallInteger('recommended_age_days');
            $table->unsignedSmallInteger('minimum_age_days')->nullable();
            $table->unsignedSmallInteger('minimum_interval_days')->nullable();
            $table->string('dose_label', 50)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['vaccine_code', 'dose_number']);
            $table->index(['is_active', 'recommended_age_days']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vaccine_schedules');
    }
};