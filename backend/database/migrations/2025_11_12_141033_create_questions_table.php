<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Questions can belong to either a test (direct) or a question bank
     */
    public function up(): void
    {
        // Drop table if it exists (in case of previous failed migration)
        Schema::dropIfExists('questions');
        
        Schema::create('questions', function (Blueprint $table) {
            $table->id();
            
            // Polymorphic relationship: can belong to test or question_bank
            $table->unsignedBigInteger('test_id')->nullable();
            $table->unsignedBigInteger('question_bank_id')->nullable();
            
            $table->enum('type', [
                'multiple_choice',
                'true_false',
                'short_answer',
                'essay',
                'fill_in_blank',
                'matching',
                'ordering'
            ])->default('multiple_choice');
            
            $table->text('content'); // Question text/content
            $table->json('answers')->nullable(); // Structured answer data
            $table->integer('points')->default(1);
            $table->integer('order')->default(0);
            $table->text('explanation')->nullable(); // Explanation shown after answering
            $table->json('metadata')->nullable(); // Additional question-specific data
            
            $table->timestamps();
            
            $table->index(['test_id']);
            $table->index(['question_bank_id']);
            $table->index(['type']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('questions');
    }
};

