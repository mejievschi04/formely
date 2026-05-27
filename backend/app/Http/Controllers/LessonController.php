<?php

namespace App\Http\Controllers;

// use App\Models\Lesson; // Removed - lessons table no longer exists
use App\Models\Course;
use App\Models\Exam;
use App\Models\ExamResult;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;

class LessonController extends Controller
{
    // Note: index and show methods removed - lessons table no longer exists
    // We use modules now, which are managed through ModuleAdminController

    // Note: complete method removed - lessons table no longer exists
    // Course completion is now handled through quiz passing in QuizController

    public function getProgress($courseId, $userId = null)
    {
        $user = Auth::user();
        
        // Use authenticated user if available, otherwise use provided userId
        $targetUserId = $user ? $user->id : $userId;
        
        if (!$targetUserId) {
            return response()->json(['error' => 'User ID required'], 400);
        }
        
        $course = Course::with('modules')->findOrFail($courseId);
        
        // Get progress from course_user pivot table
        $courseUser = DB::table('course_user')
            ->where('course_id', $courseId)
            ->where('user_id', $targetUserId)
            ->first();
        
        // Check if exam is passed
        $exam = \App\Models\Exam::where('course_id', $courseId)->first();
        $quizPassed = false;
        if ($exam) {
            $latestResult = \App\Models\ExamResult::where('exam_id', $exam->id)
                ->where('user_id', $targetUserId)
                ->orderedByAttempt()
                ->first();
            $quizPassed = $latestResult && $latestResult->passed;
        }

        return response()->json([
            'courseId' => $courseId,
            'progress_percentage' => $courseUser ? ($courseUser->progress_percentage ?? 0) : 0,
            'completed_at' => $courseUser ? $courseUser->completed_at : null,
            'quizPassed' => $quizPassed,
        ]);
    }
}

