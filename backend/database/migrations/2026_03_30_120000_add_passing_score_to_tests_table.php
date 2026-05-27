<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('tests')) {
            return;
        }

        Schema::table('tests', function (Blueprint $table) {
            if (!Schema::hasColumn('tests', 'passing_score')) {
                $table->integer('passing_score')->default(70)->after('max_attempts');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('tests')) {
            return;
        }

        Schema::table('tests', function (Blueprint $table) {
            if (Schema::hasColumn('tests', 'passing_score')) {
                $table->dropColumn('passing_score');
            }
        });
    }
};

