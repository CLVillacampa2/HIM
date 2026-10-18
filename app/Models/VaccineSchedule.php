<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class VaccineSchedule extends Model
{
    protected $fillable = [
        'vaccine_code', 'vaccine_name', 'dose_number', 'earliest_age_days',
        'recommended_age_days', 'latest_age_days', 'recommended_age_months', 'minimum_interval_days',
        'dose_label', 'notes', 'is_active',
    ];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function immunizationRecords(): HasMany
    {
        return $this->hasMany(ImmunizationRecord::class);
    }
}
