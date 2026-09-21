<?php

use App\Support\DefaultCompany;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $tables = [
        'tests',
        'question_banks',
        'questions',
        'events',
        'library_items',
        'course_maps',
        'guide_items',
        'exams',
    ];

    public function up(): void
    {
        $defaultCompanyId = DefaultCompany::id();

        foreach ($this->tables as $table) {
            if (! Schema::hasTable($table) || Schema::hasColumn($table, 'company_id')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->unsignedBigInteger('company_id')->nullable()->after('id');
                $blueprint->index('company_id');
            });
        }

        // Backfill tests from course_test → courses
        if (Schema::hasTable('tests') && Schema::hasTable('course_test') && Schema::hasTable('courses')) {
            DB::statement('
                UPDATE tests
                SET company_id = (
                    SELECT c.company_id
                    FROM course_test ct
                    INNER JOIN courses c ON c.id = ct.course_id
                    WHERE ct.test_id = tests.id
                      AND c.company_id IS NOT NULL
                    LIMIT 1
                )
                WHERE company_id IS NULL
            ');
        }

        // Backfill questions from test or question_bank
        if (Schema::hasTable('questions')) {
            if (Schema::hasTable('tests')) {
                DB::statement('
                    UPDATE questions
                    SET company_id = (
                        SELECT t.company_id FROM tests t WHERE t.id = questions.test_id LIMIT 1
                    )
                    WHERE company_id IS NULL AND test_id IS NOT NULL
                ');
            }
            if (Schema::hasTable('question_banks')) {
                // first fill banks from creator
                if (Schema::hasTable('users')) {
                    DB::statement('
                        UPDATE question_banks
                        SET company_id = (
                            SELECT u.company_id FROM users u WHERE u.id = question_banks.created_by LIMIT 1
                        )
                        WHERE company_id IS NULL AND created_by IS NOT NULL
                    ');
                }
                DB::statement('
                    UPDATE questions
                    SET company_id = (
                        SELECT qb.company_id FROM question_banks qb WHERE qb.id = questions.question_bank_id LIMIT 1
                    )
                    WHERE company_id IS NULL AND question_bank_id IS NOT NULL
                ');
            }
        }

        // Events from course or instructor
        if (Schema::hasTable('events')) {
            if (Schema::hasTable('courses')) {
                DB::statement('
                    UPDATE events
                    SET company_id = (
                        SELECT c.company_id FROM courses c WHERE c.id = events.course_id LIMIT 1
                    )
                    WHERE company_id IS NULL AND course_id IS NOT NULL
                ');
            }
            if (Schema::hasTable('users') && Schema::hasColumn('events', 'instructor_id')) {
                DB::statement('
                    UPDATE events
                    SET company_id = (
                        SELECT u.company_id FROM users u WHERE u.id = events.instructor_id LIMIT 1
                    )
                    WHERE company_id IS NULL AND instructor_id IS NOT NULL
                ');
            }
        }

        // Library / guides from uploader
        foreach (['library_items', 'guide_items'] as $table) {
            if (Schema::hasTable($table) && Schema::hasTable('users') && Schema::hasColumn($table, 'user_id')) {
                DB::statement("
                    UPDATE {$table}
                    SET company_id = (
                        SELECT u.company_id FROM users u WHERE u.id = {$table}.user_id LIMIT 1
                    )
                    WHERE company_id IS NULL AND user_id IS NOT NULL
                ");
            }
        }

        // Course maps from creator
        if (Schema::hasTable('course_maps') && Schema::hasTable('users') && Schema::hasColumn('course_maps', 'created_by')) {
            DB::statement('
                UPDATE course_maps
                SET company_id = (
                    SELECT u.company_id FROM users u WHERE u.id = course_maps.created_by LIMIT 1
                )
                WHERE company_id IS NULL AND created_by IS NOT NULL
            ');
        }

        // Exams from course
        if (Schema::hasTable('exams') && Schema::hasTable('courses')) {
            DB::statement('
                UPDATE exams
                SET company_id = (
                    SELECT c.company_id FROM courses c WHERE c.id = exams.course_id LIMIT 1
                )
                WHERE company_id IS NULL AND course_id IS NOT NULL
            ');
        }

        // Remaining → default company
        if ($defaultCompanyId) {
            foreach ($this->tables as $table) {
                if (Schema::hasTable($table) && Schema::hasColumn($table, 'company_id')) {
                    DB::table($table)->whereNull('company_id')->update(['company_id' => $defaultCompanyId]);
                }
            }
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_id')) {
                continue;
            }
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropIndex(['company_id']);
                $blueprint->dropColumn('company_id');
            });
        }
    }
};
