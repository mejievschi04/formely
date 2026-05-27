<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('course_user', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_id')->constrained('courses')->onDelete('cascade');
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->boolean('is_mandatory')->default(true); // Cursurile atribuite sunt obligatorii
            $table->boolean('enrolled')->default(true); // Status enrollment
            $table->timestamp('enrolled_at')->useCurrent(); // Data înscrierii
            $table->timestamp('assigned_at')->useCurrent(); // Data atribuirii
            $table->timestamp('started_at')->nullable(); // Când a început cursul
            $table->timestamp('completed_at')->nullable(); // Când a finalizat cursul
            $table->integer('progress_percentage')->default(0); // Progres 0-100
            $table->timestamps();
            
            // Ensure unique course-user combination
            $table->unique(['course_id', 'user_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('course_user');
    }
};
