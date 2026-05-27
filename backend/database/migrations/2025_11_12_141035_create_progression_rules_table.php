<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Rule-based progression system for courses
     */
    public function up(): void
    {
        // Drop table if it exists (in case of previous failed migration)
        Schema::dropIfExists('progression_rules');
        
        Schema::create('progression_rules', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('course_id');
            $table->foreign('course_id')->references('id')->on('courses')->onDelete('cascade');
            
            // Rule type
            $table->enum('type', [
                'lesson_completion',
                'test_passing',
                'minimum_score',
                'order_constraint',
                'time_requirement',
                'prerequisite'
            ]);
            
            // Target: what this rule applies to
            $table->enum('target_type', ['lesson', 'module', 'test', 'course'])->nullable();
            $table->unsignedBigInteger('target_id')->nullable();
            
            // Condition: what must be satisfied
            $table->enum('condition_type', ['lesson', 'module', 'test', 'score', 'time'])->nullable();
            $table->unsignedBigInteger('condition_id')->nullable();
            $table->string('condition_value')->nullable(); // For score thresholds, time requirements, etc.
            
            // Action: what happens when rule is satisfied/not satisfied
            $table->enum('action', ['unlock', 'lock', 'require', 'optional'])->default('unlock');
            
            // Rule priority (lower = higher priority)
            $table->integer('priority')->default(100);
            
            // Rule is active
            $table->boolean('active')->default(true);
            
            $table->timestamps();
            
            $table->index(['course_id', 'type', 'active']);
            $table->index(['target_type', 'target_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('progression_rules');
    }
};

