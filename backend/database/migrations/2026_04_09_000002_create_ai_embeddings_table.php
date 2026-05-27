<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_embeddings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ai_chunk_id')->constrained('ai_chunks')->cascadeOnDelete();
            $table->string('model', 120);
            $table->unsignedInteger('dimensions')->default(0);
            $table->json('vector');
            $table->string('vector_hash', 64);
            $table->timestamps();

            $table->unique(['ai_chunk_id', 'model']);
            $table->index(['model', 'vector_hash']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_embeddings');
    }
};
