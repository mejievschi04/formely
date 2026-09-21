<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Course;
use App\Models\Team;
use App\Models\User;
use App\Services\EnrollmentAssignmentService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class TeamAdminController extends Controller
{
    public function __construct()
    {
        if (auth()->check() && ! auth()->user()->canManageOrganization()) {
            abort(403, 'Nu ai drepturi pentru gestionarea echipelor.');
        }
    }

    public function index(Request $request)
    {
        $query = Team::with(['owner', 'users', 'courses', 'department:id,name,accent_color']);

        if ($request->filled('department_id')) {
            if ($request->department_id === 'none') {
                $query->whereNull('department_id');
            } else {
                $query->where('department_id', $request->integer('department_id'));
            }
        }

        $teams = $query->orderBy('sort_order')->orderBy('name')->get();

        return response()->json($teams);
    }

    public function show($id)
    {
        $team = Team::with(['owner', 'users', 'courses', 'department:id,name,accent_color'])->findOrFail($id);
        
        return response()->json($team);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'department_id' => 'nullable|exists:departments,id',
        ]);

        $validated['owner_id'] = Auth::id();
        $sortQuery = Team::query();
        if (! empty($validated['department_id'])) {
            $sortQuery->where('department_id', $validated['department_id']);
        } else {
            $sortQuery->whereNull('department_id');
        }
        $validated['sort_order'] = (int) ($sortQuery->max('sort_order') ?? 0) + 1;

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
            'department_id' => 'nullable|exists:departments,id',
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
        app(EnrollmentAssignmentService::class)->dissolveTeam($team);
        $team->delete();

        return response()->json([
            'message' => 'Echipă ștearsă cu succes',
        ]);
    }

    public function attachUsers(Request $request, $id)
    {
        $team = Team::findOrFail($id);

        $validated = $request->validate([
            'user_ids' => 'present|array',
            'user_ids.*' => 'exists:users,id',
        ]);

        $existingUserIds = $team->users()->pluck('users.id')->map(fn ($id) => (int) $id)->all();
        $requestedUserIds = array_map('intval', $validated['user_ids']);
        $newUserIds = array_values(array_diff($requestedUserIds, $existingUserIds));
        $removedUserIds = array_values(array_diff($existingUserIds, $requestedUserIds));

        $team->users()->sync($requestedUserIds);

        $assignment = app(EnrollmentAssignmentService::class);
        if ($newUserIds !== []) {
            $assignment->autoEnrollUsersForTeam(
                $team->fresh(['courses']),
                $newUserIds,
                ['assigned_by' => auth()->user()]
            );
        }
        if ($removedUserIds !== []) {
            $assignment->revokeTeamCoursesForRemovedUsers($team->fresh(['courses']), $removedUserIds);
        }

        return response()->json([
            'message' => 'Utilizatori atașați cu succes',
            'team' => $team->load(['owner', 'users', 'courses']),
        ]);
    }

    public function attachCourses(Request $request, $id)
    {
        $team = Team::findOrFail($id);

        $validated = $request->validate([
            'course_ids' => 'present|array',
            'course_ids.*' => 'exists:courses,id',
        ]);

        $existingCourseIds = $team->courses()->pluck('courses.id')->map(fn ($id) => (int) $id)->all();
        $requestedCourseIds = array_map('intval', $validated['course_ids']);
        $newCourseIds = array_values(array_diff($requestedCourseIds, $existingCourseIds));
        $removedCourseIds = array_values(array_diff($existingCourseIds, $requestedCourseIds));

        $team->courses()->sync($requestedCourseIds);

        $assignment = app(EnrollmentAssignmentService::class);
        if ($newCourseIds !== []) {
            $assignment->autoEnrollTeamForCourses(
                $team->fresh(['users']),
                $newCourseIds,
                ['assigned_by' => auth()->user()]
            );
        }
        if ($removedCourseIds !== []) {
            $assignment->revokeRemovedCoursesFromTeam($team, $removedCourseIds);
        }

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

        $assignmentService = app(EnrollmentAssignmentService::class);

        foreach ($courseIds as $courseId) {
            $course = Course::findOrFail($courseId);
            try {
                $assignmentService->assertMandatoryCourseHasRequiredTests($course, $isMandatory);
            } catch (\InvalidArgumentException $e) {
                return response()->json([
                    'error' => 'Cursurile obligatorii trebuie să aibă cel puțin un test obligatoriu',
                    'message' => "Cursul \"{$course->title}\" nu are teste obligatorii.",
                    'courses' => [['id' => $course->id, 'title' => $course->title]],
                ], 422);
            }

            $result = $assignmentService->assignCourseToUsers($course, [$user->id], [
                'is_mandatory' => $isMandatory,
                'assigned_by' => auth()->user(),
                'source_type' => \App\Models\EnrollmentAssignment::SOURCE_TEAM,
                'source_team_id' => $team->id,
            ]);

            if ($result['errors'] !== []) {
                $message = reset($result['errors']);

                return response()->json(['message' => $message], 422);
            }
        }

        return response()->json([
            'message' => 'Cursuri atribuite membrului cu succes',
            'user' => $user->load('assignedCourses'),
            'team' => $team->load(['owner', 'users', 'courses']),
        ]);
    }
}

