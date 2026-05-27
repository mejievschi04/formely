<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\CourseTest;
use App\Models\Team;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class TeamAdminController extends Controller
{
    public function __construct()
    {
        if (auth()->check() && auth()->user()->isInstructor()) {
            abort(403, 'Doar administratorii pot gestiona echipele.');
        }
    }

    public function index()
    {
        $teams = Team::with(['owner', 'users', 'courses'])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($teams);
    }

    public function show($id)
    {
        $team = Team::with(['owner', 'users', 'courses'])->findOrFail($id);
        
        return response()->json($team);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $validated['owner_id'] = Auth::id();
        $validated['sort_order'] = (int) (Team::query()->max('sort_order') ?? 0) + 1;

        $team = Team::create($validated);

        return response()->json([
            'message' => 'Echipă creată cu succes',
            'team' => $team->load(['owner', 'users', 'courses']),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $team = Team::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $team->update($validated);

        return response()->json([
            'message' => 'Echipă actualizată cu succes',
            'team' => $team->load(['owner', 'users', 'courses']),
        ]);
    }

    public function destroy($id)
    {
        $team = Team::findOrFail($id);
        $team->delete();

        return response()->json([
            'message' => 'Echipă ștearsă cu succes',
        ]);
    }

    public function attachUsers(Request $request, $id)
    {
        $team = Team::findOrFail($id);

        $validated = $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $team->users()->sync($validated['user_ids']);

        return response()->json([
            'message' => 'Utilizatori atașați cu succes',
            'team' => $team->load(['owner', 'users', 'courses']),
        ]);
    }

    public function attachCourses(Request $request, $id)
    {
        $team = Team::findOrFail($id);

        $validated = $request->validate([
            'course_ids' => 'required|array',
            'course_ids.*' => 'exists:courses,id',
        ]);

        $team->courses()->sync($validated['course_ids']);

        return response()->json([
            'message' => 'Cursuri atașate cu succes',
            'team' => $team->load(['owner', 'users', 'courses']),
        ]);
    }

    /**
     * Reordonare echipe după ID-uri în ordinea afișată.
     */
    public function reorderTeams(Request $request)
    {
        $validated = $request->validate([
            'team_ids' => 'required|array',
            'team_ids.*' => 'integer|exists:teams,id',
        ]);

        foreach ($validated['team_ids'] as $index => $teamId) {
            Team::whereKey($teamId)->update(['sort_order' => $index]);
        }

        return response()->json(['message' => 'Ordinea echipelor a fost salvată']);
    }

    /**
     * Atribuie cursuri unui membru al echipei (înscrieri în course_user, fără a șterge alte atribuiri).
     */
    public function attachMemberCourses(Request $request, $id, $userId)
    {
        $team = Team::findOrFail($id);
        $user = User::findOrFail($userId);

        if (! $team->users()->where('users.id', $user->id)->exists()) {
            return response()->json([
                'message' => 'Utilizatorul nu face parte din această echipă.',
            ], 422);
        }

        if ($user->isLearningActivityExempt()) {
            return response()->json([
                'message' => 'Nu atribuim cursuri pentru acest tip de utilizator.',
            ], 422);
        }

        $validated = $request->validate([
            'course_ids' => 'required|array',
            'course_ids.*' => 'exists:courses,id',
            'is_mandatory' => 'nullable|boolean',
        ]);

        $courseIds = $validated['course_ids'];
        $isMandatory = $validated['is_mandatory'] ?? true;

        if ($isMandatory) {
            $coursesWithoutRequiredTests = [];
            foreach ($courseIds as $courseId) {
                $course = Course::find($courseId);
                if ($course) {
                    $hasRequiredTest = CourseTest::where('course_id', $courseId)
                        ->where('required', true)
                        ->exists();
                    if (! $hasRequiredTest) {
                        $coursesWithoutRequiredTests[] = [
                            'id' => $courseId,
                            'title' => $course->title,
                        ];
                    }
                }
            }
            if (! empty($coursesWithoutRequiredTests)) {
                $courseTitles = implode(', ', array_column($coursesWithoutRequiredTests, 'title'));
                $courseCount = count($coursesWithoutRequiredTests);

                return response()->json([
                    'error' => 'Cursurile obligatorii trebuie să aibă cel puțin un test obligatoriu',
                    'message' => $courseCount === 1
                        ? "Cursul \"{$courseTitles}\" nu are teste obligatorii."
                        : "Următoarele cursuri nu au teste obligatorii: {$courseTitles}.",
                    'courses' => $coursesWithoutRequiredTests,
                ], 422);
            }
        }

        $attach = [];
        foreach ($courseIds as $courseId) {
            $attach[$courseId] = [
                'is_mandatory' => $isMandatory,
                'assigned_at' => now(),
                'enrolled' => true,
                'enrolled_at' => now(),
            ];
        }
        $user->assignedCourses()->syncWithoutDetaching($attach);

        Cache::forget("dashboard_user_{$user->id}_stats");
        Cache::forget("profile_user_{$user->id}");

        return response()->json([
            'message' => 'Cursuri atribuite membrului cu succes',
            'user' => $user->load('assignedCourses'),
            'team' => $team->load(['owner', 'users', 'courses']),
        ]);
    }
}

