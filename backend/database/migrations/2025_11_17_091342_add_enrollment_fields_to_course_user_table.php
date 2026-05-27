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
        Schema::table('course_user', function (Blueprint $table) {
            // These columns might already exist from create_course_user_table, so check before adding
            if (!Schema::hasColumn('course_user', 'enrolled')) {
                $table->boolean('enrolled')->default(true)->after('is_mandatory');
            }
            if (!Schema::hasColumn('course_user', 'enrolled_at')) {
                $table->timestamp('enrolled_at')->useCurrent()->after('enrolled');
            }
            if (!Schema::hasColumn('course_user', 'started_at')) {
                $table->timestamp('started_at')->nullable()->after('assigned_at');
            }
            if (!Schema::hasColumn('course_user', 'completed_at')) {
                $table->timestamp('completed_at')->nullable()->after('started_at');
            }
            if (!Schema::hasColumn('course_user', 'progress_percentage')) {
                $table->integer('progress_percentage')->default(0)->after('completed_at');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('course_user', function (Blueprint $table) {
            $table->dropColumn(['enrolled', 'enrolled_at', 'started_at', 'completed_at', 'progress_percentage']);
        });
    }
};
