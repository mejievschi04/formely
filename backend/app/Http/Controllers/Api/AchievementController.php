<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AchievementController extends Controller
{
    /**
     * Get all achievements for authenticated user
     */
    public function index()
    {
        $user = Auth::user();

        // Get completed courses count
        $completedCourses = DB::table('course_user')
            ->where('user_id', $user->id)
            ->where('enrolled', true)
            ->whereNotNull('completed_at')
            ->count();

        // Get completed lessons count
        $completedLessons = 0;
        if (Schema::hasTable('lesson_progress')) {
            $completedLessons = DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->where('completed', true)
                ->count();
        }

        // Timp real petrecut (lesson_progress) sau, dacă lipsește, estimare din durata lecțiilor completate
        $learningHours = 0;
        if (Schema::hasTable('lesson_progress')) {
            $totalSeconds = (int) DB::table('lesson_progress')
                ->where('user_id', $user->id)
                ->sum('time_spent_seconds');
            if ($totalSeconds > 0) {
                $learningHours = round($totalSeconds / 3600, 1);
            } elseif (Schema::hasTable('lessons')) {
                $totalMinutes = DB::table('lesson_progress')
                    ->join('lessons', 'lesson_progress.lesson_id', '=', 'lessons.id')
                    ->where('lesson_progress.user_id', $user->id)
                    ->where('lesson_progress.completed', true)
                    ->whereNotNull('lessons.duration_minutes')
                    ->sum('lessons.duration_minutes');

                $learningHours = round((float) $totalMinutes / 60, 1);
            }
        }

        // Get milestones
        $milestones = $this->getUserMilestones($user);

        return response()->json([
            'completed_courses' => $completedCourses,
            'completed_lessons' => $completedLessons,
            'learning_hours' => $learningHours,
            'milestones' => $milestones,
        ]);
    }

    /**
     * Get user milestones
     */
    private function getUserMilestones($user)
    {
        $milestones = [];

        // Get course progress milestones
        $courses = DB::table('course_user')
            ->join('courses', 'course_user.course_id', '=', 'courses.id')
            ->where('course_user.user_id', $user->id)
            ->where('course_user.enrolled', true)
            ->select('courses.id', 'courses.title', 'course_user.progress_percentage', 'course_user.updated_at')
            ->get();

        foreach ($courses as $course) {
            $progress = $course->progress_percentage;

            // 25% milestone
            if ($progress >= 25 && $progress < 50) {
                $milestones[] = [
                    'icon' => '🎯',
                    'title' => '25% finalizat - ' . $course->title,
                    'description' => 'Ai finalizat primul sfert din curs!',
                    'achieved_at' => $course->updated_at,
                ];
            }

            // 50% milestone
            if ($progress >= 50 && $progress < 75) {
                $milestones[] = [
                    'icon' => '🌟',
                    'title' => '50% finalizat - ' . $course->title,
                    'description' => 'Ai finalizat jumătate din curs!',
                    'achieved_at' => $course->updated_at,
                ];
            }

            // 75% milestone
            if ($progress >= 75 && $progress < 100) {
                $milestones[] = [
                    'icon' => '🚀',
                    'title' => '75% finalizat - ' . $course->title,
                    'description' => 'Ești aproape de finalizare!',
                    'achieved_at' => $course->updated_at,
                ];
            }

            // 100% milestone
            if ($progress >= 100) {
                $milestones[] = [
                    'icon' => '🎓',
                    'title' => 'Curs finalizat - ' . $course->title,
                    'description' => 'Felicitări! Ai finalizat cursul!',
                    'achieved_at' => DB::table('course_user')
                        ->where('user_id', $user->id)
                        ->where('course_id', $course->id)
                        ->value('completed_at'),
                ];
            }
        }

        // Sort by date (most recent first)
        usort($milestones, function($a, $b) {
            return strtotime($b['achieved_at']) - strtotime($a['achieved_at']);
        });

        return array_slice($milestones, 0, 20); // Return last 20 milestones
    }
}

