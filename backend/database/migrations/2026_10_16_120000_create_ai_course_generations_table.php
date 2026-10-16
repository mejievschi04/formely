<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_course_generations', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->uuid('request_key');
            $table->string('fingerprint', 64);
            $table->string('status', 20)->default('queued');
            $table->json('input');
            $table->json('outline')->nullable();
            $table->json('lessons')->nullable();
            $table->unsignedInteger('completed_lessons')->default(0);
            $table->unsignedInteger('total_lessons');
            $table->text('error')->nullable();
            $table->json('result')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'request_key']);
            $table->index(['company_id', 'user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_course_generations');
    }
};
