<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SyncLog extends Model
{
    protected $fillable = [
        'user_id', 'client_device_id', 'client_transaction_id', 'entity_type',
        'client_entity_id', 'operation', 'status', 'payload_hash', 'result_metadata',
        'error_message', 'received_at', 'processed_at',
    ];

    protected function casts(): array
    {
        return [
            'result_metadata' => 'array',
            'received_at' => 'datetime',
            'processed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
