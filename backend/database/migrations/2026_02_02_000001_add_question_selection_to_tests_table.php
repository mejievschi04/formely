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
            if (!Schema::hasColumn('tests', 'question_selection')) {
                $table->json('question_selection')->nullable()->after('question_source');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('tests')) {
            return;
        }

        Schema::table('tests', function (Blueprint $table) {
            if (Schema::hasColumn('tests', 'question_selection')) {
                $table->dropColumn('question_selection');
            }
        });
    }
};

