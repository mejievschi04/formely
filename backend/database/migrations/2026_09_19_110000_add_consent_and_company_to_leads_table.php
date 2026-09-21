<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('leads')) {
            return;
        }

        Schema::table('leads', function (Blueprint $table) {
            if (! Schema::hasColumn('leads', 'privacy_accepted_at')) {
                $table->timestamp('privacy_accepted_at')->nullable()->after('contacted_at');
            }
            if (! Schema::hasColumn('leads', 'company_id')) {
                $table->unsignedBigInteger('company_id')->nullable()->after('privacy_accepted_at');
                $table->index('company_id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('leads')) {
            return;
        }

        Schema::table('leads', function (Blueprint $table) {
            if (Schema::hasColumn('leads', 'company_id')) {
                $table->dropIndex(['company_id']);
                $table->dropColumn('company_id');
            }
            if (Schema::hasColumn('leads', 'privacy_accepted_at')) {
                $table->dropColumn('privacy_accepted_at');
            }
        });
    }
};
