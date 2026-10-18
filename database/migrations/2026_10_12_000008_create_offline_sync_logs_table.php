<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('offline_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('client_device_id', 100);
            $table->uuid('client_transaction_id');
            $table->string('entity_type', 80);
            $table->uuid('client_entity_id')->nullable();
            $table->string('operation', 20);
            $table->string('status', 20)->default('pending');
            $table->char('payload_hash', 64)->nullable();
            $table->json('result_metadata')->nullable();
            $table->text('error_message')->nullable();
            $table->dateTime('received_at')->useCurrent();
            $table->dateTime('processed_at')->nullable();
            $table->timestamps();

            $table->unique(['client_device_id', 'client_transaction_id'], 'offline_sync_device_tx_unique');
            $table->index(['status', 'received_at']);
            $table->index(['entity_type', 'client_entity_id']);
            $table->index(['user_id', 'received_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('offline_sync_logs');
    }
};