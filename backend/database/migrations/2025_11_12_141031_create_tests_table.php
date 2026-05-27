<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Tests are standalone entities, not tied to courses
     */
    public function up(): void
    {
        // Drop table if it exists (in case of previous failed migration)
        Schema::dropIfExists('tests');
        
        Schema::create('tests', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->enum('type', ['practice', 'graded', 'final'])->default('graded');
            $table->enum('status', ['draft', 'published', 'archived'])->default('draft');
            
            // Test settings
            $table->integer('time_limit_minutes')->nullable();
            $table->integer('max_attempts')->nullable();
            $table->boolean('randomize_questions')->default(false);
            $table->boolean('randomize_answers')->default(false);
            $table->boolean('show_results_immediately')->default(true);
            $table->boolean('show_correct_answers')->default(false);
            $table->boolean('allow_review')->default(true);
            
            // Question source (either direct questions or question bank)
            $table->unsignedBigInteger('question_set_id')->nullable(); // For question banks
            $table->enum('question_source', ['direct', 'bank'])->default('direct');
            
            // Analytics
            $table->integer('attempts_count')->default(0);
            $table->integer('passes_count')->default(0);
            $table->decimal('average_score', 5, 2)->nullable();
            
            // Metadata
            $table->unsignedBigInteger('created_by');
            $table->foreign('created_by')->references('id')->on('users')->onDelete('cascade');
            $table->string('version')->default('1.0.0');
            $table->timestamps();
            $table->softDeletes();
            
            $table->index(['status', 'type']);
            $table->index('created_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tests');
    }
};

