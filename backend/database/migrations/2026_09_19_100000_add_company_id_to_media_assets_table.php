<?php

use App\Support\DefaultCompany;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('media_assets') || Schema::hasColumn('media_assets', 'company_id')) {
            return;
        }

        Schema::table('media_assets', function (Blueprint $table) {
            $table->unsignedBigInteger('company_id')->nullable()->after('id');
            $table->index('company_id');
        });

        if (Schema::hasTable('courses')) {
            DB::statement('
                UPDATE media_assets
                SET company_id = (
                    SELECT c.company_id FROM courses c WHERE c.id = media_assets.course_id LIMIT 1
                )
                WHERE company_id IS NULL AND course_id IS NOT NULL
            ');
        }

        if (Schema::hasTable('users')) {
            DB::statement('
                UPDATE media_assets
                SET company_id = (
                    SELECT u.company_id FROM users u WHERE u.id = media_assets.uploaded_by_user_id LIMIT 1
                )
                WHERE company_id IS NULL AND uploaded_by_user_id IS NOT NULL
            ');
        }

        $defaultCompanyId = DefaultCompany::id();
        if ($defaultCompanyId) {
            DB::table('media_assets')->whereNull('company_id')->update(['company_id' => $defaultCompanyId]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('media_assets') || ! Schema::hasColumn('media_assets', 'company_id')) {
            return;
        }

        Schema::table('media_assets', function (Blueprint $table) {
            $table->dropIndex(['company_id']);
            $table->dropColumn('company_id');
        });
    }
};
