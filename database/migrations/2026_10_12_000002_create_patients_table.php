<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patients', function (Blueprint $table) {
            $table->id();
            $table->foreignId('household_id')->nullable()->constrained()->nullOnDelete();
            $table->string('patient_number', 40)->unique();
            $table->uuid('qr_code_token')->unique();
            $table->string('first_name', 100);
            $table->string('middle_name', 100)->nullable();
            $table->string('last_name', 100);
            $table->string('suffix', 20)->nullable();
            $table->date('date_of_birth')->index();
            $table->string('sex_at_birth', 20)->default('unknown');
            $table->string('contact_number', 30)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('guardian_name', 200)->nullable();
            $table->string('guardian_relationship', 50)->nullable();
            $table->string('guardian_contact_number', 30)->nullable();
            $table->text('address_notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['last_name', 'first_name']);
            $table->index(['household_id', 'date_of_birth']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patients');
    }
};