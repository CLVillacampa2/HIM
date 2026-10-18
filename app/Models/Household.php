<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Household extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'household_uuid', 'household_code', 'region', 'province', 'city_municipality', 'barangay',
        'purok_sitio', 'street', 'house_number', 'postal_code', 'contact_number', 'address_notes',
    ];

    protected static function booted(): void
    {
        static::creating(function (Household $household): void {
            $household->household_uuid ??= (string) Str::uuid();
            $household->household_code ??= 'HH-'.Str::upper(Str::substr(str_replace('-', '', $household->household_uuid), 0, 12));
        });
    }

    public function patients(): HasMany
    {
        return $this->hasMany(Patient::class);
    }

    public function headOfHousehold(): HasOne
    {
        return $this->hasOne(Patient::class)->where('is_household_head', true);
    }
}
