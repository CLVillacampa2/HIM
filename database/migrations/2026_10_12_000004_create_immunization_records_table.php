<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('immunization_records', function (Blueprint $table) {
            $table->id();
            $table->uuid('client_record_id')->unique();
            $table->foreignId('patient_id')->constrained()->restrictOnDelete();
            $table->foreignId('vaccine_schedule_id')->constrained()->restrictOnDelete();
            $table->foreignId('administered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('administered_at')->index();
            $table->string('dose_label', 50)->nullable();
            $table->string('lot_number', 100)->nullable();
            $table->date('vaccine_expiry_date')->nullable();
            $table->string('administration_site', 100)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['patient_id', 'administered_at']);
            $table->index(['vaccine_schedule_id', 'administered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('immunization_records');
    }
};