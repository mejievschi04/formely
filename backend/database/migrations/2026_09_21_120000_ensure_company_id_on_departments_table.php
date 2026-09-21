<?php

use App\Support\DefaultCompany;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * departments e creată în 2026_05_29_180000, după 100001 care adaugă company_id
 * pe tabelele existente — deci pe instalări fresh departments rămâne fără company_id
 * și CompanyScope produce 500 pe /api/admin/organization.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('departments')) {
            return;
        }

        if (! Schema::hasColumn('departments', 'company_id')) {
            Schema::table('departments', function (Blueprint $table) {
                $table->unsignedBigInteger('company_id')->nullable()->after('id');
                $table->index('company_id');
            });
        }

        $defaultCompanyId = DefaultCompany::id();
        if ($defaultCompanyId) {
            DB::table('departments')->whereNull('company_id')->update(['company_id' => $defaultCompanyId]);
        }

        // Backfill from owner when possible
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'company_id')) {
            DB::statement('
                UPDATE departments
                SET company_id = (
                    SELECT u.company_id FROM users u WHERE u.id = departments.owner_id LIMIT 1
                )
                WHERE company_id IS NULL AND owner_id IS NOT NULL
            ');
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('departments') || ! Schema::hasColumn('departments', 'company_id')) {
            return;
        }

        Schema::table('departments', function (Blueprint $table) {
            $table->dropIndex(['company_id']);
            $table->dropColumn('company_id');
        });
    }
};
