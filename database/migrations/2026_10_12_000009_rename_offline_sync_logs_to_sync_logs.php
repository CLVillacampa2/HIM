<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('offline_sync_logs') && ! Schema::hasTable('sync_logs')) {
            Schema::rename('offline_sync_logs', 'sync_logs');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('sync_logs') && ! Schema::hasTable('offline_sync_logs')) {
            Schema::rename('sync_logs', 'offline_sync_logs');
        }
    }
};