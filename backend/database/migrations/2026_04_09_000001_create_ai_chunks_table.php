<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_chunks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->nullable()->constrained('courses')->nullOnDelete();
            $table->foreignId('module_id')->nullable()->constrained('modules')->nullOnDelete();
            $table->foreignId('lesson_id')->nullable()->constrained('lessons')->nullOnDelete();
            $table->foreignId('content_block_id')->nullable()->constrained('content_blocks')->nullOnDelete();
            $table->string('source_type', 50)->default('lesson');
            $table->unsignedInteger('chunk_index')->default(0);
            $table->unsignedInteger('token_count')->default(0);
            $table->text('content');
            $table->string('content_hash', 64);
            $table->string('language', 10)->default('ro');
            $table->boolean('visible')->default(true);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['lesson_id', 'chunk_index']);
            $table->index(['course_id', 'source_type']);
            $table->index('content_hash');
            $table->index('visible');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_chunks');
    }
};
