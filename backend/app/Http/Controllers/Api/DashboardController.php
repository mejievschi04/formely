<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Module;
use App\Models\ExamResult;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        
        if (!$user) {
            return response()->json(['error' => 'Neautentificat'], 401);
        }

        // Cache key for user-specific dashboard data
        $cacheKey = "dashboard_user_{$user->id}";
        
        // Try to get cached stats (cache for 5 minutes)
        $cachedStats = Cache::remember($cacheKey . '_stats', 300, function () use ($user) {
            // Get assigned courses with progress from course_user pivot table
            $assignedCourses = $user->assignedCourses()
                ->withPivot('progress_percentage', 'completed_at', 'enrolled', 'started_at')
                ->with(['modules:id,course_id,title,order', 'teacher:id,name'])
                ->wherePivot('enrolled', true)
                ->get();
            
            $assignedCourseIds = $assignedCourses->pluck('id')->toArray();
            
            // Calculate completed courses (where completed_at is not null)
            $completedCourses = $assignedCourses->filter(function($course) {
                return $course->pivot->completed_at !== null;
            });
            
            // Calculate total modules in assigned courses
            $totalModulesInAssigned = $assignedCourses->sum(function($course) {
                return $course->modules->count();
            });
            
            // Modules don't have individual completion tracking - use course progress instead
            $completedModules = 0; // Not tracked individually
            
            // Calculate real progress percentage from course_user pivot table
            // Average of all assigned courses' progress_percentage
            $totalProgress = $assignedCourses->sum(function($course) {
                return $course->pivot->progress_percentage ?? 0;
            });
            $progressPercentage = $assignedCourses->count() > 0 
                ? round($totalProgress / $assignedCourses->count()) 
                : 0;

            // Get completed quizzes (passed exams) - count unique exams passed
            $completedQuizzes = ExamResult::where('user_id', $user->id)
                ->where('passed', true)
                ->distinct('exam_id')
                ->count('exam_id');

            // Get courses in progress (assigned but not completed)
            $inProgressCourses = $assignedCourses->filter(function($course) {
                return $course->pivot->completed_at === null && 
                       ($course->pivot->progress_percentage ?? 0) > 0;
            });

            return [
                'stats' => [
                    'assignedCourses' => $assignedCourses->count(),
                    'completedCourses' => $completedCourses->count(),
                    'completedModules' => $completedModules,
                    'totalModulesInAssigned' => $totalModulesInAssigned,
                    'completedQuizzes' => $completedQuizzes,
                    'inProgressCourses' => $inProgressCourses->count(),
                    'progressPercentage' => $progressPercentage,
                ],
                'assignedCourses' => $assignedCourses->map(function($course) {
                    return [
                        'id' => $course->id,
                        'title' => $course->title,
                        'progress_percentage' => $course->pivot->progress_percentage ?? 0,
                        'completed_at' => $course->pivot->completed_at,
                        'started_at' => $course->pivot->started_at,
                    ];
                }),
            ];
        });

        // Get courses list (lightweight, without full module content)
        $courses = Course::with(['modules:id,course_id,title,order', 'teacher:id,name'])
            ->select('id', 'title', 'description', 'reward_points', 'teacher_id')
            ->get()
            ->map(function($course) {
                return [
                    'id' => $course->id,
                    'title' => $course->title,
                    'description' => $course->description,
                    'reward_points' => $course->reward_points,
                    'modules' => $course->modules->map(function($module) {
                        return [
                            'id' => $module->id,
                            'title' => $module->title,
                            'order' => $module->order,
                        ];
                    }),
                    'teacher' => $course->teacher ? [
                        'id' => $course->teacher->id,
                        'name' => $course->teacher->name,
                    ] : null,
                ];
            });

        return response()->json([
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'level' => $user->level,
                'points' => $user->points,
            ],
            'stats' => $cachedStats['stats'],
            'assignedCourses' => $cachedStats['assignedCourses'],
            'courses' => $courses,
        ]);
    }
}

