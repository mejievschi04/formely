<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('exam_attempt_sessions')) {
            return;
        }

        Schema::create('exam_attempt_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('exam_id')->constrained('exams')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('attempt_number');
            $table->json('question_snapshot');
            $table->json('answers')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->unique(['exam_id', 'user_id', 'attempt_number'], 'exam_attempt_sessions_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exam_attempt_sessions');
    }
};
