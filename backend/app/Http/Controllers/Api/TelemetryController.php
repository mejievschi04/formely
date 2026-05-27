<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\Request;

class TelemetryController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'event_name' => 'required|string|max:120',
            'payload' => 'nullable|array',
            'model_type' => 'nullable|string|max:120',
            'model_id' => 'nullable|integer',
        ]);

        $allowedEvents = [
            'admin_course_created',
            'admin_course_version_published',
            'admin_test_published',
            'learner_attempt_started',
            'learner_answer_saved',
            'learner_attempt_submitted',
            'learner_result_viewed',
            'learner_retake_weak_areas_started',
            'learner_focus_seconds',
        ];

        if (!in_array($validated['event_name'], $allowedEvents, true)) {
            return response()->json([
                'message' => 'Invalid telemetry event name.',
            ], 422);
        }

        $user = $request->user();
        if ($user && $user->isLearningActivityExempt()) {
            return response()->json(['ok' => true]);
        }

        if ($validated['event_name'] === 'learner_focus_seconds') {
            $sec = (int) ($request->input('payload.seconds'));
            $lessonId = (int) ($request->input('payload.lesson_id'));
            if ($sec < 1 || $sec > 7200 || $lessonId < 1) {
                return response()->json([
                    'message' => 'Invalid focus payload: seconds (1–7200) and lesson_id required.',
                ], 422);
            }
        }

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'telemetry.' . $validated['event_name'],
            'model_type' => $validated['model_type'] ?? null,
            'model_id' => $validated['model_id'] ?? null,
            'description' => 'Telemetry event: ' . $validated['event_name'],
            'new_values' => $validated['payload'] ?? [],
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json(['ok' => true]);
    }
}
