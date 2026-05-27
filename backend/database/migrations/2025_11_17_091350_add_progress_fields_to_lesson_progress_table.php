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
        Schema::table('lesson_progress', function (Blueprint $table) {
            $table->integer('time_spent_seconds')->default(0)->after('completed');
            $table->integer('progress_percentage')->default(0)->after('time_spent_seconds');
            $table->timestamp('started_at')->nullable()->after('progress_percentage');
            $table->timestamp('completed_at')->nullable()->after('started_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('lesson_progress', function (Blueprint $table) {
            $table->dropColumn(['time_spent_seconds', 'progress_percentage', 'started_at', 'completed_at']);
        });
    }
};
