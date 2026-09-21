<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tests', function (Blueprint $table) {
            if (! Schema::hasColumn('tests', 'show_only_submitted_answers')) {
                $table->boolean('show_only_submitted_answers')->default(false)->after('show_correct_answers');
            }
        });
    }

    public function down(): void
    {
        Schema::table('tests', function (Blueprint $table) {
            if (Schema::hasColumn('tests', 'show_only_submitted_answers')) {
                $table->dropColumn('show_only_submitted_answers');
            }
        });
    }
};
