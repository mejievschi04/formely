<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Mape curs: foldere pentru grupare cursuri (admin/instructor).
     */
    public function up(): void
    {
        Schema::create('course_maps', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->onDelete('set null');
            $table->unsignedSmallInteger('order')->default(0);
            $table->timestamps();
        });

        Schema::create('course_map_course', function (Blueprint $table) {
            $table->id();
            $table->foreignId('course_map_id')->constrained('course_maps')->onDelete('cascade');
            $table->foreignId('course_id')->constrained('courses')->onDelete('cascade');
            $table->unsignedSmallInteger('order')->default(0);
            $table->timestamps();
            $table->unique(['course_map_id', 'course_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('course_map_course');
        Schema::dropIfExists('course_maps');
    }
};
