<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('households', function (Blueprint $table) {
            $table->id();
            $table->string('household_code', 40)->unique();
            $table->string('region', 100)->nullable();
            $table->string('province', 100)->nullable();
            $table->string('city_municipality', 100)->nullable();
            $table->string('barangay', 100);
            $table->string('purok_sitio', 100)->nullable();
            $table->string('street', 150)->nullable();
            $table->string('house_number', 50)->nullable();
            $table->string('postal_code', 10)->nullable();
            $table->string('contact_number', 30)->nullable();
            $table->text('address_notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['barangay', 'purok_sitio']);
            $table->index(['province', 'city_municipality']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('households');
    }
};