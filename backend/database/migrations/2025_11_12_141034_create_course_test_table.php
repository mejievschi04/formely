<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * 
     * Pivot table linking courses to tests with scope and rules
     */
    public function up(): void
    {
        // Drop table if it exists (in case of previous failed migration)
        Schema::dropIfExists('course_test');
        
        Schema::create('course_test', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('course_id');
            $table->unsignedBigInteger('test_id');
            $table->foreign('course_id')->references('id')->on('courses')->onDelete('cascade');
            $table->foreign('test_id')->references('id')->on('tests')->onDelete('cascade');
            
            // Scope: where the test is attached (lesson, module, or course level)
            $table->enum('scope', ['lesson', 'module', 'course'])->default('course');
            $table->unsignedBigInteger('scope_id')->nullable(); // lesson_id or module_id if scope is lesson/module
            
            // Test requirements
            $table->boolean('required')->default(false);
            $table->integer('passing_score')->default(70); // Override test default if needed
            $table->integer('order')->default(0); // Order within scope
            
            // Unlock conditions
            $table->boolean('unlock_after_previous')->default(false);
            $table->unsignedBigInteger('unlock_after_test_id')->nullable(); // Must pass this test first
            
            $table->timestamps();
            
            $table->unique(['course_id', 'test_id', 'scope', 'scope_id'], 'course_test_scope_unique');
            $table->index(['course_id', 'scope', 'scope_id']);
            $table->index(['test_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('course_test');
    }
};

