<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('course_id')->nullable()->constrained('courses')->nullOnDelete();
            $table->foreignId('lesson_id')->nullable()->constrained('lessons')->nullOnDelete();
            $table->string('mode', 50)->default('answer');
            $table->string('intent', 50)->nullable();
            $table->string('provider', 30)->nullable();
            $table->string('model', 120)->nullable();
            $table->string('status', 30)->default('completed');
            $table->text('prompt');
            $table->text('response')->nullable();
            $table->json('context_chunks')->nullable();
            $table->json('metadata')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->string('prompt_hash', 64)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['course_id', 'lesson_id']);
            $table->index(['mode', 'status']);
            $table->index('prompt_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_logs');
    }
};
