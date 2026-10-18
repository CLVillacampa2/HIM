<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Patient extends Model
{
    use SoftDeletes;

    protected $appends = ['qr_code_payload'];

    protected $fillable = [
        'household_id', 'patient_uuid', 'patient_number', 'qr_code_token',
        'first_name', 'middle_name', 'last_name', 'suffix', 'date_of_birth', 'sex_at_birth',
        'philhealth_id', 'is_household_head', 'contact_number', 'email', 'guardian_name',
        'guardian_relationship', 'guardian_contact_number', 'address_notes',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'is_household_head' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Patient $patient): void {
            $patient->patient_uuid ??= (string) Str::uuid();
            $patient->qr_code_token ??= (string) Str::uuid();
            $patient->patient_number ??= 'BHC-'.Str::upper(Str::substr(str_replace('-', '', $patient->patient_uuid), 0, 10));
        });
    }

    public function getRouteKeyName(): string
    {
        return 'patient_uuid';
    }

    public function getQrCodePayloadAttribute(): string
    {
        return 'BHC:patient:'.$this->patient_uuid;
    }

    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    public function immunizationRecords(): HasMany
    {
        return $this->hasMany(ImmunizationRecord::class);
    }

    public function clinicalEncounters(): HasMany
    {
        return $this->hasMany(ClinicalEncounter::class);
    }
}
