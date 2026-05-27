<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->boolean('is_group')->default(false)->after('user2_id');
            $table->string('name')->nullable()->after('is_group');
            $table->foreignId('created_by')->nullable()->after('name')->constrained('users')->nullOnDelete();
        });

        Schema::table('conversations', function (Blueprint $table) {
            try {
                $table->dropUnique(['user1_id', 'user2_id']);
            } catch (\Throwable $e) {
                // Ignore when index name differs on some environments.
            }
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            try {
                $table->unique(['user1_id', 'user2_id']);
            } catch (\Throwable $e) {
                // Ignore if already present.
            }

            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn(['name', 'is_group']);
        });
    }
};

