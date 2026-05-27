<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            // Certificate fields
            if (!Schema::hasColumn('courses', 'has_certificate')) {
                $table->boolean('has_certificate')->default(false)->after('currency');
            }
            if (!Schema::hasColumn('courses', 'min_test_score')) {
                $table->integer('min_test_score')->nullable()->default(70)->after('has_certificate');
            }
            if (!Schema::hasColumn('courses', 'allow_retake')) {
                $table->boolean('allow_retake')->default(true)->after('min_test_score');
            }
            if (!Schema::hasColumn('courses', 'max_retakes')) {
                $table->integer('max_retakes')->nullable()->default(3)->after('allow_retake');
            }
            
            // Drip content fields
            if (!Schema::hasColumn('courses', 'drip_content')) {
                $table->boolean('drip_content')->default(false)->after('max_retakes');
            }
            if (!Schema::hasColumn('courses', 'drip_schedule')) {
                $table->json('drip_schedule')->nullable()->after('drip_content');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('courses', function (Blueprint $table) {
            $columns = [
                'has_certificate',
                'min_test_score',
                'allow_retake',
                'max_retakes',
                'drip_content',
                'drip_schedule',
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('courses', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
