<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lesson;
use App\Support\LearningVisibility;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class LessonController extends Controller
{
    public function show(Request $request, $id)
    {
        $isStaff = LearningVisibility::isStaffRequest($request);

        $query = Lesson::with([
            'course',
            'module',
            'contentBlocks' => function ($q) {
                $q->orderBy('order')
                    ->where(function ($q) {
                        $q->where('visible', true)->orWhereNull('visible');
                    });
            },
        ]);

        if (! $isStaff) {
            if (Schema::hasColumn('lessons', 'status')) {
                $query->where('status', 'published');
            }
            if (Schema::hasColumn('courses', 'status')) {
                $query->whereHas('course', fn ($c) => $c->where('status', 'published'));
            }
        }

        $lesson = $query->findOrFail($id);

        return response()->json($lesson);
    }
}

