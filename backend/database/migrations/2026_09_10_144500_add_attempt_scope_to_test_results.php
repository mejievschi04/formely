<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('test_results')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            if (! Schema::hasColumn('test_results', 'attempt_scope')) {
                $table->string('attempt_scope', 64)->nullable()->unique();
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('test_results')) {
            return;
        }

        Schema::table('test_results', function (Blueprint $table) {
            if (Schema::hasColumn('test_results', 'attempt_scope')) {
                $table->dropUnique(['attempt_scope']);
                $table->dropColumn('attempt_scope');
            }
        });
    }
};
