<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Formely ștersese ghidurile (2026_09_21_100000_drop_guide_items_table); după alinierea
 * cu Volta ele există din nou. Pe bazele unde tabelul lipsește îl recreăm cu schema Volta.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('guide_items')) {
            return;
        }

        Schema::create('guide_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('url', 2048);
            $table->string('cover_image_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        // Tabelul aparține migrării Volta 2026_06_18_160000_create_guide_items_table.
    }
};
