<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('learning_paths')) {
            return;
        }

        Schema::table('learning_paths', function (Blueprint $table) {
            if (! Schema::hasColumn('learning_paths', 'deadline_at')) {
                $table->timestamp('deadline_at')->nullable()->after('settings');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('learning_paths')) {
            return;
        }

        Schema::table('learning_paths', function (Blueprint $table) {
            if (Schema::hasColumn('learning_paths', 'deadline_at')) {
                $table->dropColumn('deadline_at');
            }
        });
    }
};
