<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_encounters', function (Blueprint $table) {
            $table->id();
            $table->uuid('client_encounter_id')->unique();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('attending_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('encountered_at')->index();
            $table->string('encounter_type', 50)->default('consultation');
            $table->string('chief_complaint', 500)->nullable();
            $table->text('clinical_notes')->nullable();
            $table->decimal('temperature_celsius', 4, 1)->nullable();
            $table->unsignedSmallInteger('systolic_bp')->nullable();
            $table->unsignedSmallInteger('diastolic_bp')->nullable();
            $table->unsignedSmallInteger('pulse_rate')->nullable();
            $table->unsignedSmallInteger('respiratory_rate')->nullable();
            $table->decimal('oxygen_saturation', 5, 2)->nullable();
            $table->decimal('weight_kg', 6, 2)->nullable();
            $table->decimal('height_cm', 6, 2)->nullable();
            $table->dateTime('follow_up_at')->nullable();
            $table->timestamps();

            $table->index(['patient_id', 'encountered_at']);
            $table->index(['encounter_type', 'encountered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_encounters');
    }
};