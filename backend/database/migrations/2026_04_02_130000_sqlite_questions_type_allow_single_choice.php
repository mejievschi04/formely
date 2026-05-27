<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pe SQLite, $table->enum() devine VARCHAR + CHECK fără single_choice → PUT questions eșuează.
 * Recreăm tabelul cu type ca string (fără CHECK restrictiv).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'sqlite' || !Schema::hasTable('questions')) {
            return;
        }

        Schema::dropIfExists('questions_new');

        Schema::create('questions_new', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('test_id')->nullable();
            $table->unsignedBigInteger('question_bank_id')->nullable();
            $table->string('type', 64)->default('multiple_choice');
            $table->text('content');
            $table->json('answers')->nullable();
            $table->integer('points')->default(1);
            $table->integer('order')->default(0);
            $table->text('explanation')->nullable();
            $table->json('metadata')->nullable();
            $table->boolean('is_starred')->default(false);
            $table->timestamps();
            // Numele indexurilor trebuie unice în tot DB-ul SQLite până la drop la `questions`.
            $table->index(['test_id']);
            $table->index(['question_bank_id']);
            $table->index(['type']);
            $table->index(['is_starred']);
        });

        $hasStar = Schema::hasColumn('questions', 'is_starred');

        if ($hasStar) {
            DB::statement('
                INSERT INTO questions_new (
                    id, test_id, question_bank_id, type, content, answers, points, "order", explanation, metadata, is_starred, created_at, updated_at
                )
                SELECT
                    id, test_id, question_bank_id, type, content, answers, points, "order", explanation, metadata,
                    COALESCE(is_starred, 0), created_at, updated_at
                FROM questions
            ');
        } else {
            DB::statement('
                INSERT INTO questions_new (
                    id, test_id, question_bank_id, type, content, answers, points, "order", explanation, metadata, is_starred, created_at, updated_at
                )
                SELECT
                    id, test_id, question_bank_id, type, content, answers, points, "order", explanation, metadata,
                    0, created_at, updated_at
                FROM questions
            ');
        }

        Schema::drop('questions');
        Schema::rename('questions_new', 'questions');

        $maxId = (int) DB::table('questions')->max('id');
        if ($maxId > 0) {
            DB::delete("DELETE FROM sqlite_sequence WHERE name = 'questions'");
            DB::insert('INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', ['questions', $maxId]);
        }
    }

    public function down(): void
    {
        // Nu restaurăm CHECK-ul enum original
    }
};
