<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('learning_path_enrollments')) {
            return;
        }

        Schema::table('learning_path_enrollments', function (Blueprint $table) {
            if (! Schema::hasColumn('learning_path_enrollments', 'deadline_at')) {
                $table->timestamp('deadline_at')->nullable()->after('completed_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('learning_path_enrollments')) {
            return;
        }

        Schema::table('learning_path_enrollments', function (Blueprint $table) {
            if (Schema::hasColumn('learning_path_enrollments', 'deadline_at')) {
                $table->dropColumn('deadline_at');
            }
        });
    }
};
