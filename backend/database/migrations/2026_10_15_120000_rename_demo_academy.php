<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $slug = config('formely.demo_company_slug', 'formely-demo');
        if (! $slug || $slug === config('formely.default_company_slug')) {
            return;
        }

        DB::table('companies')->where('slug', $slug)
            ->whereIn('name', ['Formely', 'Formely Demo'])
            ->update(['name' => 'Academie Demo', 'updated_at' => now()]);
    }

    public function down(): void
    {
        // Păstrăm identitatea explicită a academiei demo la rollback.
    }
};
