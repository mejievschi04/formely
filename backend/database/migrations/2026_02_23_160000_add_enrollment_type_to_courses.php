<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Step 6 Publishing: enrollment type (open, by_invite, paid) per instructiuni.md.
     */
    public function up(): void
    {
        if (!Schema::hasTable('courses')) {
            return;
        }
        if (Schema::hasColumn('courses', 'enrollment_type')) {
            return;
        }
        Schema::table('courses', function (Blueprint $table) {
            $table->string('enrollment_type', 30)->default('open')->after('access_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'enrollment_type')) {
            Schema::table('courses', function (Blueprint $table) {
                $table->dropColumn('enrollment_type');
            });
        }
    }
};
