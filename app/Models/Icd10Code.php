<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Icd10Code extends Model
{
    protected $fillable = ['code', 'description', 'category', 'release_version', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function encounters(): BelongsToMany
    {
        return $this->belongsToMany(ClinicalEncounter::class, 'clinical_encounter_diagnoses')
            ->withPivot(['is_primary', 'diagnosis_notes'])
            ->withTimestamps();
    }
}
