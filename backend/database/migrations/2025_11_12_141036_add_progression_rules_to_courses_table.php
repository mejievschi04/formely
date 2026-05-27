<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Add progression_rules JSON column to courses for quick access
     */
    public function up(): void
    {
        // Only run if courses table exists
        if (!Schema::hasTable('courses')) {
            return;
        }

        Schema::table('courses', function (Blueprint $table) {
            if (!Schema::hasColumn('courses', 'progression_rules')) {
                $table->json('progression_rules')->nullable()->after('sequential_unlock');
            }
            
            // Add category field if not exists
            if (!Schema::hasColumn('courses', 'category')) {
                $table->string('category')->nullable()->after('level');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            if (Schema::hasColumn('courses', 'progression_rules')) {
                $table->dropColumn('progression_rules');
            }
            if (Schema::hasColumn('courses', 'category')) {
                $table->dropColumn('category');
            }
        });
    }
};

