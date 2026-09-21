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
        if (! Schema::hasTable('user_invitations')) {
            return;
        }

        if (! Schema::hasColumn('user_invitations', 'company_id')) {
            Schema::table('user_invitations', function (Blueprint $table) {
                $table->unsignedBigInteger('company_id')->nullable()->after('id');
                $table->index('company_id');
            });
        }

        $defaultId = DefaultCompany::id();
        if ($defaultId) {
            DB::table('user_invitations')->whereNull('company_id')->update(['company_id' => $defaultId]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('user_invitations') && Schema::hasColumn('user_invitations', 'company_id')) {
            Schema::table('user_invitations', function (Blueprint $table) {
                $table->dropIndex(['company_id']);
                $table->dropColumn('company_id');
            });
        }
    }
};
