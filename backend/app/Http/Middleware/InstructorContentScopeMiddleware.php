<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Instructor: doar creare/editare conținut LMS (cursuri, builder, module, lecții,
 * examene, teste, întrebări, bănci, media, conținut AI).
 * Fără utilizatori, echipe, setări, statistici, mape cursuri, export etc. Evenimentele: acces cu domeniu instructor în controller.
 */
class InstructorContentScopeMiddleware
{
    private const BLOCKED_PREFIXES = [
        'api/admin/users',
        'api/admin/team-members',
        'api/admin/teams',
        'api/admin/settings',
        'api/admin/activity-logs',
        'api/admin/statistics',
        'api/admin/export',
        'api/admin/import',
        'api/admin/system',
        'api/admin/course-maps',
        'api/admin/courses/bulk-actions',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $user = auth()->user();
        if (! $user || ! $user->isInstructor()) {
            return $next($request);
        }

        $path = strtolower($request->path());
        foreach (self::BLOCKED_PREFIXES as $prefix) {
            if ($path === $prefix || str_starts_with($path, $prefix.'/')) {
                return response()->json([
                    'error' => 'Instructorii au acces doar la crearea și editarea conținutului (cursuri, lecții, examene, teste, bănci de întrebări).',
                ], 403);
            }
        }

        return $next($request);
    }
}
