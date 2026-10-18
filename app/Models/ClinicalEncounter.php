<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ClinicalEncounter extends Model
{
    protected $fillable = [
        'client_encounter_id', 'patient_id', 'attending_user_id', 'encountered_at',
        'encounter_type', 'chief_complaint', 'clinical_notes', 'temperature_celsius',
        'systolic_bp', 'diastolic_bp', 'pulse_rate', 'respiratory_rate', 'oxygen_saturation',
        'weight_kg', 'height_cm', 'follow_up_at',
    ];

    protected function casts(): array
    {
        return [
            'encountered_at' => 'datetime',
            'follow_up_at' => 'datetime',
            'temperature_celsius' => 'decimal:1',
            'oxygen_saturation' => 'decimal:2',
            'weight_kg' => 'decimal:2',
            'height_cm' => 'decimal:2',
        ];
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function attendingUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'attending_user_id');
    }

    public function diagnoses(): BelongsToMany
    {
        return $this->belongsToMany(Icd10Code::class, 'clinical_encounter_diagnoses')
            ->withPivot(['is_primary', 'diagnosis_notes'])
            ->withTimestamps();
    }
}
