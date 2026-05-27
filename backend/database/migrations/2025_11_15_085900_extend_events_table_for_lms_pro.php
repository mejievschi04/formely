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
        Schema::table('events', function (Blueprint $table) {
            // Status: draft / published / upcoming / live / completed / cancelled
            if (!Schema::hasColumn('events', 'status')) {
                $table->enum('status', ['draft', 'published', 'upcoming', 'live', 'completed', 'cancelled'])->default('draft')->after('type');
            }
            
            // Timezone
            if (!Schema::hasColumn('events', 'timezone')) {
                $table->string('timezone', 50)->default('Europe/Bucharest')->after('end_date');
            }
            
            // Location or live link
            if (!Schema::hasColumn('events', 'live_link')) {
                $table->string('live_link')->nullable()->after('location');
            }
            
            // Capacity
            if (!Schema::hasColumn('events', 'max_capacity')) {
                $table->integer('max_capacity')->nullable()->after('live_link');
            }
            
            // Instructor/Speaker
            if (!Schema::hasColumn('events', 'instructor_id')) {
                $table->foreignId('instructor_id')->nullable()->constrained('users')->onDelete('set null')->after('max_capacity');
            }
            
            // Access type: free / paid / course_included
            if (!Schema::hasColumn('events', 'access_type')) {
                $table->enum('access_type', ['free', 'paid', 'course_included'])->default('free')->after('instructor_id');
            }
            
            // Price (if paid)
            if (!Schema::hasColumn('events', 'price')) {
                $table->decimal('price', 10, 2)->nullable()->after('access_type');
            }
            
            // Currency
            if (!Schema::hasColumn('events', 'currency')) {
                $table->string('currency', 3)->default('RON')->after('price');
            }
            
            // Course ID (if included in course)
            if (!Schema::hasColumn('events', 'course_id')) {
                $table->foreignId('course_id')->nullable()->constrained('courses')->onDelete('set null')->after('currency');
            }
            
            // Replay URL (for recordings)
            if (!Schema::hasColumn('events', 'replay_url')) {
                $table->string('replay_url')->nullable()->after('course_id');
            }
            
            // KPI fields
            if (!Schema::hasColumn('events', 'registrations_count')) {
                $table->integer('registrations_count')->default(0)->after('replay_url');
            }
            
            if (!Schema::hasColumn('events', 'attendance_count')) {
                $table->integer('attendance_count')->default(0)->after('registrations_count');
            }
            
            if (!Schema::hasColumn('events', 'replay_views_count')) {
                $table->integer('replay_views_count')->default(0)->after('attendance_count');
            }
            
            // Thumbnail/image
            if (!Schema::hasColumn('events', 'thumbnail')) {
                $table->string('thumbnail')->nullable()->after('replay_views_count');
            }
            
            // Short description
            if (!Schema::hasColumn('events', 'short_description')) {
                $table->text('short_description')->nullable()->after('description');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $columns = [
                'status', 'timezone', 'live_link', 'max_capacity', 'instructor_id',
                'access_type', 'price', 'currency', 'course_id', 'replay_url',
                'registrations_count', 'attendance_count', 'replay_views_count',
                'thumbnail', 'short_description'
            ];
            
            foreach ($columns as $column) {
                if (Schema::hasColumn('events', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

