<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\UserAssignedCoursesService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use App\Support\ImageOptimizer;

class ProfileController extends Controller
{
    public function index(Request $request)
    {
        try {
            $user = Auth::user();
            
            if (!$user) {
                return response()->json(['error' => 'Neautentificat'], 401);
            }

            $cachedData = $this->getProfileCoursesData($user);

            $avatarUrl = $user->avatar
                ? ('/storage/' . ltrim($user->avatar, '/'))
                : null;

            $courseStats = $cachedData['course_stats'];

            return response()->json([
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'bio' => $user->bio,
                    'avatar' => $avatarUrl,
                    'level' => $user->level,
                    'points' => $user->points,
                    'role' => $user->role,
                ],
                'stats' => [
                    'completedQuizzes' => $cachedData['completed_quizzes'],
                    'inProgressCourses' => $cachedData['in_progress_courses'],
                    'completedCourses' => $cachedData['completed_courses'],
                    'notAccessedCourses' => $courseStats['not_accessed'],
                    'totalAssigned' => $courseStats['total_assigned'],
                    'progressPercentage' => $cachedData['completion_percentage'],
                ],
                'courseStats' => $courseStats,
                'coursesAssigned' => $cachedData['courses_assigned'],
                'coursesInProgress' => $cachedData['courses_in_progress'],
                'coursesCompleted' => $cachedData['courses_completed'],
                'coursesNotAccessed' => $cachedData['courses_not_accessed'],
            ]);
        } catch (\Exception $e) {
            Log::error('ProfileController error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'user_id' => Auth::id(),
            ]);
            return response()->json([
                'error' => 'Eroare la încărcarea profilului',
                'message' => (config('app.debug') ? $e->getMessage() : null)
            ], 500);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function getProfileCoursesData(User $user): array
    {
        $cacheKey = "profile_user_{$user->id}";
        $cachedData = Cache::get($cacheKey);

        if (! is_array($cachedData) || ! isset($cachedData['course_stats'])) {
            Cache::forget($cacheKey);
            $cachedData = $this->buildFreshProfileCoursesData($user);
            Cache::put($cacheKey, $cachedData, 300);
        }

        return $cachedData;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildFreshProfileCoursesData(User $user): array
    {
        $userWithCourses = User::with([
            'assignedCourses.modules:id,course_id,title,order',
            'assignedCourses.teacher:id,name',
        ])->findOrFail($user->id);

        return app(UserAssignedCoursesService::class)->buildProfileCoursesData($userWithCourses);
    }

    /**
     * Update own profile (name, email, bio). Students and any authenticated user.
     */
    public function update(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Neautentificat'], 401);
        }

        $isStudent = ($user->role ?? '') === 'student';

        if ($isStudent) {
            $validated = $request->validate([
                'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
                'bio' => ['nullable', 'string', 'max:2000'],
            ]);
        } else {
            $validated = $request->validate([
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
                'bio' => ['nullable', 'string', 'max:2000'],
            ]);
            $user->name = $validated['name'];
        }

        $user->email = $validated['email'];
        $bio = $validated['bio'] ?? null;
        $user->bio = is_string($bio) && $bio !== '' ? $bio : null;
        $user->save();

        Cache::forget("profile_user_{$user->id}");

        $avatarUrl = $user->avatar
            ? ('/storage/' . ltrim($user->avatar, '/'))
            : null;

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'bio' => $user->bio,
                'avatar' => $avatarUrl,
                'level' => $user->level,
                'points' => $user->points,
                'role' => $user->role,
            ],
        ]);
    }

    /**
     * Upload or update profile picture (avatar).
     * Accepts multipart/form-data with field "avatar" (image file).
     */
    public function updateAvatar(Request $request)
    {
        $request->validate([
            'avatar' => 'required|image|mimes:jpeg,png,gif,webp|max:2048',
        ]);

        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Neautentificat'], 401);
        }

        $file = ImageOptimizer::optimize($request->file('avatar'), ImageOptimizer::AVATAR_MAX);
        $ext = $file->getClientOriginalExtension() ?: 'jpg';
        $path = $file->storeAs('avatars', $user->id . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext, 'public');
        $oldAvatar = $user->avatar;

        $user->avatar = $path;
        $user->save();

        if ($oldAvatar && $oldAvatar !== $path) {
            try {
                Storage::disk('public')->delete($oldAvatar);
            } catch (\Exception $e) {
                Log::warning('Could not delete old avatar: ' . $e->getMessage());
            }
        }

        Cache::forget("profile_user_{$user->id}");

        $avatarUrl = '/storage/' . ltrim($path, '/');
        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => $avatarUrl,
                'role' => $user->role,
            ],
        ]);
    }

    /**
     * Remove profile picture.
     */
    public function removeAvatar(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Neautentificat'], 401);
        }

        if ($user->avatar) {
            try {
                Storage::disk('public')->delete($user->avatar);
            } catch (\Exception $e) {
                Log::warning('Could not delete avatar: ' . $e->getMessage());
            }
            $user->avatar = null;
            $user->save();
            Cache::forget("profile_user_{$user->id}");
        }

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'avatar' => null,
                'role' => $user->role,
            ],
        ]);
    }
}
