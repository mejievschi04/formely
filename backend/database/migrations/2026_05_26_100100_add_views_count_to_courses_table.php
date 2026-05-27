<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('courses')) {
            return;
        }

        Schema::table('courses', function (Blueprint $table) {
            if (! Schema::hasColumn('courses', 'views_count')) {
                $table->unsignedInteger('views_count')->default(0)->after('reward_points');
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'views_count')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->dropColumn('views_count');
            });
        }
    }
};
