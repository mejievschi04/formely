<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('content_blocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lesson_id')->nullable()->constrained('lessons')->onDelete('cascade');
            // ContentBlock poate fi reutilizabil (lesson_id nullable)
            $table->string('type'); // video, text, audio, file, link, live
            $table->text('source'); // URL, file path, text content, etc.
            $table->json('metadata')->nullable(); // Additional metadata (duration, size, etc.)
            $table->string('language', 10)->default('ro');
            $table->string('version', 20)->nullable(); // Version control pentru reutilizare
            $table->integer('order')->default(0); // Ordine în lecție
            $table->boolean('visible')->default(true); // Toggle vizibilitate (draft/public)
            $table->timestamps();
            
            // Index pentru performanță
            $table->index(['lesson_id', 'order']);
            $table->index('type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('content_blocks');
    }
};
