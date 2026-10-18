<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class Icd10CodeSeeder extends Seeder
{
    public function run(): void
    {
        // A starter index of common primary-care terms; replace/extend from a licensed,
        // versioned WHO ICD-10 source for production coding and reporting.
        $codes = [
            ['I10', 'Essential (primary) hypertension', 'Circulatory system'],
            ['E11.9', 'Type 2 diabetes mellitus without complications', 'Endocrine and metabolic'],
            ['J06.9', 'Acute upper respiratory infection, unspecified', 'Respiratory system'],
            ['J00', 'Acute nasopharyngitis (common cold)', 'Respiratory system'],
            ['J02.9', 'Acute pharyngitis, unspecified', 'Respiratory system'],
            ['J03.9', 'Acute tonsillitis, unspecified', 'Respiratory system'],
            ['J18.9', 'Pneumonia, unspecified organism', 'Respiratory system'],
            ['J20.9', 'Acute bronchitis, unspecified', 'Respiratory system'],
            ['A09', 'Infectious gastroenteritis and colitis, unspecified', 'Infections'],
            ['R50.9', 'Fever, unspecified', 'Symptoms and signs'],
            ['R05.9', 'Cough, unspecified', 'Symptoms and signs'],
            ['R51.9', 'Headache, unspecified', 'Symptoms and signs'],
            ['M54.5', 'Low back pain', 'Musculoskeletal system'],
            ['N39.0', 'Urinary tract infection, site not specified', 'Genitourinary system'],
            ['N30.0', 'Acute cystitis', 'Genitourinary system'],
            ['B34.9', 'Viral infection, unspecified', 'Infections'],
            ['L30.9', 'Dermatitis, unspecified', 'Skin'],
            ['L23.9', 'Allergic contact dermatitis, unspecified cause', 'Skin'],
            ['J30.9', 'Allergic rhinitis, unspecified', 'Respiratory system'],
            ['H10.9', 'Conjunctivitis, unspecified', 'Eye'],
            ['K29.7', 'Gastritis, unspecified', 'Digestive system'],
            ['K21.9', 'Gastro-oesophageal reflux disease without oesophagitis', 'Digestive system'],
            ['D64.9', 'Anaemia, unspecified', 'Blood and immune system'],
            ['E78.5', 'Hyperlipidaemia, unspecified', 'Endocrine and metabolic'],
            ['E66.9', 'Obesity, unspecified', 'Endocrine and metabolic'],
            ['R10.9', 'Unspecified abdominal pain', 'Symptoms and signs'],
            ['R11.2', 'Nausea with vomiting, unspecified', 'Symptoms and signs'],
            ['R19.7', 'Diarrhoea, unspecified', 'Symptoms and signs'],
            ['A90', 'Dengue fever [classical dengue]', 'Infections'],
            ['A91', 'Dengue haemorrhagic fever', 'Infections'],
            ['A15.9', 'Respiratory tuberculosis, unspecified', 'Infections'],
            ['A27.9', 'Leptospirosis, unspecified', 'Infections'],
            ['A01.0', 'Typhoid fever', 'Infections'],
            ['B86', 'Scabies', 'Infections'],
            ['B35.3', 'Tinea pedis', 'Skin'],
            ['A64', 'Unspecified sexually transmitted disease', 'Infections'],
            ['N76.0', 'Acute vaginitis', 'Genitourinary system'],
            ['F32.9', 'Depressive episode, unspecified', 'Mental health'],
            ['R42', 'Dizziness and giddiness', 'Symptoms and signs'],
            ['E86.0', 'Dehydration', 'Endocrine and metabolic'],
            ['J45.9', 'Asthma, unspecified', 'Respiratory system'],
            ['I25.9', 'Chronic ischaemic heart disease, unspecified', 'Circulatory system'],
            ['Z34.9', 'Supervision of normal pregnancy, unspecified', 'Factors influencing health status'],
            ['Z00.0', 'General medical examination', 'Factors influencing health status'],
            ['Z23', 'Encounter for immunisation', 'Factors influencing health status'],
            ['K08.9', 'Disorder of teeth and supporting structures, unspecified', 'Digestive system'],
            ['B50.9', 'Plasmodium falciparum malaria, unspecified', 'Infections'],
            ['U07.1', 'COVID-19, virus identified', 'Infections'],
            ['O99.0', 'Anaemia complicating pregnancy, childbirth and the puerperium', 'Pregnancy'],
            ['R03.0', 'Elevated blood-pressure reading, without diagnosis of hypertension', 'Symptoms and signs'],
        ];

        $rows = array_map(static fn (array $code): array => [
            'code' => $code[0],
            'description' => $code[1],
            'category' => $code[2],
            'release_version' => 'WHO ICD-10 (verify local release)',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ], $codes);

        DB::table('icd10_codes')->upsert(
            $rows,
            ['code'],
            ['description', 'category', 'release_version', 'is_active', 'updated_at'],
        );
    }
}
