<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Household;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class HouseholdController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $households = Household::query()
            ->withCount('patients')
            ->with('headOfHousehold:id,household_id,first_name,last_name,patient_number')
            ->when($request->string('q')->trim()->value(), function ($query, string $term): void {
                $query->where(function ($query) use ($term): void {
                    $query->where('household_code', 'like', "%{$term}%")
                        ->orWhere('barangay', 'like', "%{$term}%")
                        ->orWhere('purok_sitio', 'like', "%{$term}%")
                        ->orWhere('street', 'like', "%{$term}%");
                });
            })
            ->orderBy('barangay')
            ->orderBy('purok_sitio')
            ->paginate(min(max($request->integer('per_page', 25), 1), 100));

        return response()->json($households);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'household_code' => ['sometimes', 'string', 'max:40', 'unique:households,household_code'],
            'region' => ['nullable', 'string', 'max:100'],
            'province' => ['nullable', 'string', 'max:100'],
            'city_municipality' => ['nullable', 'string', 'max:100'],
            'barangay' => ['required', 'string', 'max:100'],
            'purok_sitio' => ['nullable', 'string', 'max:100'],
            'street' => ['nullable', 'string', 'max:150'],
            'house_number' => ['nullable', 'string', 'max:50'],
            'postal_code' => ['nullable', 'string', 'max:10'],
            'contact_number' => ['nullable', 'string', 'max:30'],
            'address_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['household_code'] ??= 'HH-'.Str::upper(Str::substr(str_replace('-', '', (string) Str::uuid()), 0, 12));
        $household = Household::create($data);

        return response()->json($household, 201);
    }

    public function show(Household $household): JsonResponse
    {
        return response()->json($household->load(['patients', 'headOfHousehold']));
    }
}
