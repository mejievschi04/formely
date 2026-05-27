<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            if (!Schema::hasColumn('questions', 'is_starred')) {
                $table->boolean('is_starred')->default(false)->after('metadata');
                $table->index('is_starred');
            }
        });
    }

    public function down(): void
    {
        Schema::table('questions', function (Blueprint $table) {
            if (Schema::hasColumn('questions', 'is_starred')) {
                $table->dropIndex(['is_starred']);
                $table->dropColumn('is_starred');
            }
        });
    }
};
