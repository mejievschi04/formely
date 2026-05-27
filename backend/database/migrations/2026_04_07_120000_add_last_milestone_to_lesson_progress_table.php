<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('lesson_progress') || Schema::hasColumn('lesson_progress', 'last_milestone_reached')) {
            return;
        }

        Schema::table('lesson_progress', function (Blueprint $table) {
            $table->unsignedTinyInteger('last_milestone_reached')->default(0)->after('progress_percentage');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('lesson_progress') || !Schema::hasColumn('lesson_progress', 'last_milestone_reached')) {
            return;
        }

        Schema::table('lesson_progress', function (Blueprint $table) {
            $table->dropColumn('last_milestone_reached');
        });
    }
};
