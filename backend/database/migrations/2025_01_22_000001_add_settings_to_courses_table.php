<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Add settings JSON column to courses for modular configuration
     * Settings include: access, drip, certificate configurations
     */
    public function up(): void
    {
        // Only run if courses table exists
        if (!Schema::hasTable('courses')) {
            return;
        }

        Schema::table('courses', function (Blueprint $table) {
            if (!Schema::hasColumn('courses', 'settings')) {
                $table->json('settings')->nullable()->after('progression_rules');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            if (Schema::hasColumn('courses', 'settings')) {
                $table->dropColumn('settings');
            }
        });
    }
};

