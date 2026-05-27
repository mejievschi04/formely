<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ensure test_results table exists (for PostgreSQL / when rename migration ran before exam_results was created).
 * The rename migration (141037) runs before create_exam_results (092920), so exam_results gets created
 * but test_results never does. This migration creates test_results if missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('test_results')) {
            return;
        }

        Schema::create('test_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('test_id')->constrained('tests')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->integer('score')->default(0);
            $table->integer('max_score')->nullable();
            $table->integer('percentage')->default(0);
            $table->boolean('passed')->default(false);
            $table->integer('attempt_number')->default(1);
            $table->json('answers')->nullable();
            $table->integer('time_taken_minutes')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('status')->default('completed');
            $table->timestamps();

            $table->index(['user_id', 'test_id', 'percentage', 'passed']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('test_results');
    }
};
