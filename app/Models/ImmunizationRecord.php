<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ImmunizationRecord extends Model
{
    protected $fillable = [
        'client_record_id', 'patient_id', 'vaccine_schedule_id', 'administered_by',
        'administered_at', 'dose_label', 'lot_number', 'vaccine_expiry_date',
        'administration_site', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'administered_at' => 'datetime',
            'vaccine_expiry_date' => 'date',
        ];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(VaccineSchedule::class, 'vaccine_schedule_id');
    }

    public function administrator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'administered_by');
    }
}
