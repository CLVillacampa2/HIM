<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clinical_encounter_diagnoses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('clinical_encounter_id')->constrained()->cascadeOnDelete();
            $table->foreignId('icd10_code_id')->constrained()->restrictOnDelete();
            $table->boolean('is_primary')->default(false);
            $table->text('diagnosis_notes')->nullable();
            $table->timestamps();

            $table->unique(['clinical_encounter_id', 'icd10_code_id'], 'ced_encounter_icd10_unique');
            $table->index(['icd10_code_id', 'is_primary'], 'ced_icd10_primary_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clinical_encounter_diagnoses');
    }
};