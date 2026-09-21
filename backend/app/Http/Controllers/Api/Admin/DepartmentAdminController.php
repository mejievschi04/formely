<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\Team;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DepartmentAdminController extends Controller
{
    public function __construct()
    {
        if (auth()->check() && ! auth()->user()->canManageOrganization()) {
            abort(403, 'Nu ai drepturi pentru gestionarea organizației.');
        }
    }

    public function index()
    {
        $departments = Department::with(['owner:id,name,email'])
            ->withCount('teams')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json($departments);
    }

    public function tree()
    {
        $departments = Department::with([
            'owner:id,name,email',
            'teams' => function ($query) {
                $query->with(['owner:id,name,email', 'users:id,name,email', 'courses:id,title'])
                    ->orderBy('sort_order')
                    ->orderBy('name');
            },
        ])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $uncategorizedTeams = Team::with(['owner:id,name,email', 'users:id,name,email', 'courses:id,title'])
            ->whereNull('department_id')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json([
            'departments' => $departments,
            'uncategorized_teams' => $uncategorizedTeams,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $department = Department::create([
            'name' => strip_tags($validated['name']),
            'description' => isset($validated['description']) ? strip_tags($validated['description']) : null,
            'accent_color' => $validated['accent_color'] ?? null,
            'owner_id' => Auth::id(),
            'sort_order' => (int) (Department::query()->max('sort_order') ?? 0) + 1,
        ]);

        return response()->json([
            'message' => 'Departament creat cu succes',
            'department' => $department->load('owner:id,name,email'),
        ], 201);
    }

    public function update(Request $request, $id)
    {
        $department = Department::findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string|max:2000',
            'accent_color' => ['nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        if (isset($validated['name'])) {
            $validated['name'] = strip_tags($validated['name']);
        }
        if (array_key_exists('description', $validated)) {
            $validated['description'] = $validated['description'] !== null
                ? strip_tags($validated['description'])
                : null;
        }

        $department->update($validated);

        return response()->json([
            'message' => 'Departament actualizat cu succes',
            'department' => $department->fresh(['owner:id,name,email']),
        ]);
    }

    public function destroy($id)
    {
        $department = Department::findOrFail($id);

        if ($department->teams()->exists()) {
            return response()->json([
                'message' => 'Nu poți șterge un departament care încă are echipe. Mută sau șterge echipele mai întâi.',
            ], 422);
        }

        $department->delete();

        return response()->json([
            'message' => 'Departament șters cu succes.',
        ]);
    }

    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'department_ids' => 'required|array',
            'department_ids.*' => 'integer|exists:departments,id',
        ]);

        foreach ($validated['department_ids'] as $index => $departmentId) {
            Department::whereKey($departmentId)->update(['sort_order' => $index]);
        }

        return response()->json(['message' => 'Ordinea departamentelor a fost salvată']);
    }
}
