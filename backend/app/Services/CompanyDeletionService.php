<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Course;
use App\Models\Lead;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Ștergere definitivă academie + date tenant (platform operator).
 */
class CompanyDeletionService
{
    /** @var list<string> */
    private array $companyScopedTables = [
        'enrollment_assignments',
        'user_test_attempt_grants',
        'media_assets',
        'library_items',
        'events',
        'exams',
        'questions',
        'question_banks',
        'tests',
        'course_maps',
        'courses',
        'teams',
        'departments',
        'learning_paths',
        'user_invitations',
        'registration_invitations',
        'guide_items',
    ];

    public function deletePermanently(Company $company): void
    {
        DB::transaction(function () use ($company) {
            $companyId = (int) $company->id;

            if (Schema::hasTable('leads') && Schema::hasColumn('leads', 'company_id')) {
                Lead::query()->where('company_id', $companyId)->update(['company_id' => null]);
            }

            $userIds = User::withoutGlobalScopes()
                ->where('company_id', $companyId)
                ->pluck('id')
                ->all();

            $courseIds = [];
            if (Schema::hasTable('courses') && Schema::hasColumn('courses', 'company_id')) {
                $courseIds = Course::withoutGlobalScopes()
                    ->where('company_id', $companyId)
                    ->pluck('id')
                    ->all();
            }

            $this->deleteCourseGraph($courseIds);
            $this->deleteByCompanyId($companyId);

            if ($userIds !== []) {
                if (Schema::hasTable('personal_access_tokens')) {
                    DB::table('personal_access_tokens')
                        ->where('tokenable_type', User::class)
                        ->whereIn('tokenable_id', $userIds)
                        ->delete();
                }

                if (Schema::hasTable('team_user')) {
                    DB::table('team_user')->whereIn('user_id', $userIds)->delete();
                }

                if (Schema::hasTable('course_user')) {
                    DB::table('course_user')->whereIn('user_id', $userIds)->delete();
                }

                if (Schema::hasTable('sessions')) {
                    DB::table('sessions')->whereIn('user_id', $userIds)->delete();
                }

                User::withoutGlobalScopes()
                    ->where('company_id', $companyId)
                    ->get()
                    ->each(function (User $user) {
                        $user->forceDelete();
                    });
            }

            $company->deleteLogoFile();
            $this->deleteCompanyStorageDir($companyId);
            $company->delete();
        });
    }

    /**
     * @param  list<int|string>  $courseIds
     */
    private function deleteCourseGraph(array $courseIds): void
    {
        if ($courseIds === []) {
            return;
        }

        $pivotTables = [
            'course_user',
            'course_test',
            'course_team',
            'course_map_course',
            'lesson_progress',
        ];

        foreach ($pivotTables as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            if (Schema::hasColumn($table, 'course_id')) {
                DB::table($table)->whereIn('course_id', $courseIds)->delete();
            }
        }

        if (Schema::hasTable('media_assets') && Schema::hasColumn('media_assets', 'course_id')) {
            $paths = DB::table('media_assets')
                ->whereIn('course_id', $courseIds)
                ->whereNotNull('path')
                ->pluck('path');
            foreach ($paths as $path) {
                try {
                    Storage::disk('public')->delete($path);
                } catch (\Throwable) {
                    // ignore
                }
            }
            DB::table('media_assets')->whereIn('course_id', $courseIds)->delete();
        }

        // Lecțiile fără modul (Volta) și indexul de cunoștințe AI sunt legate direct de curs.
        if (Schema::hasTable('lessons') && Schema::hasColumn('lessons', 'course_id')) {
            $rootLessonIds = DB::table('lessons')->whereIn('course_id', $courseIds)->pluck('id');
            if ($rootLessonIds->isNotEmpty()) {
                if (Schema::hasTable('content_blocks')) {
                    DB::table('content_blocks')->whereIn('lesson_id', $rootLessonIds)->delete();
                }
                if (Schema::hasTable('lesson_progress')) {
                    DB::table('lesson_progress')->whereIn('lesson_id', $rootLessonIds)->delete();
                }
            }
        }
        if (Schema::hasTable('ai_chunks')) {
            $chunkIds = DB::table('ai_chunks')->whereIn('course_id', $courseIds)->pluck('id');
            if ($chunkIds->isNotEmpty() && Schema::hasTable('ai_embeddings')) {
                DB::table('ai_embeddings')->whereIn('ai_chunk_id', $chunkIds)->delete();
            }
            DB::table('ai_chunks')->whereIn('course_id', $courseIds)->delete();
        }

        if (Schema::hasTable('modules')) {
            $moduleIds = DB::table('modules')->whereIn('course_id', $courseIds)->pluck('id');
            if ($moduleIds->isNotEmpty() && Schema::hasTable('lessons')) {
                $lessonIds = DB::table('lessons')->whereIn('module_id', $moduleIds)->pluck('id');
                if ($lessonIds->isNotEmpty()) {
                    if (Schema::hasTable('content_blocks')) {
                        DB::table('content_blocks')->whereIn('lesson_id', $lessonIds)->delete();
                    }
                    if (Schema::hasTable('lesson_progress')) {
                        DB::table('lesson_progress')->whereIn('lesson_id', $lessonIds)->delete();
                    }
                    DB::table('lessons')->whereIn('id', $lessonIds)->delete();
                }
            }
            DB::table('modules')->whereIn('course_id', $courseIds)->delete();
        }

        if (Schema::hasTable('lessons') && Schema::hasColumn('lessons', 'course_id')) {
            DB::table('lessons')->whereIn('course_id', $courseIds)->delete();
        }

        if (Schema::hasTable('courses')) {
            DB::table('courses')->whereIn('id', $courseIds)->delete();
        }
    }

    private function deleteByCompanyId(int $companyId): void
    {
        foreach ($this->companyScopedTables as $table) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_id')) {
                continue;
            }
            DB::table($table)->where('company_id', $companyId)->delete();
        }
    }

    private function deleteCompanyStorageDir(int $companyId): void
    {
        try {
            Storage::disk('public')->deleteDirectory('companies/'.$companyId);
        } catch (\Throwable) {
            // ignore
        }
    }
}
