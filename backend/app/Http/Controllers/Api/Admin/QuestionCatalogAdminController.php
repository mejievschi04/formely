<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CourseMap;
use App\Models\Question;
use App\Models\Test;
use App\Support\CourseMapBuckets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class QuestionCatalogAdminController extends Controller
{
    public function maps(Request $request)
    {
        $defaultMapIds = CourseMapBuckets::defaultMapIds();
        $search = trim((string) $request->input('search', ''));
        $instructorId = auth()->user()->isInstructor() ? (int) auth()->id() : null;

        $mapsQuery = CourseMap::query()
            ->withCount('courses')
            ->orderBy('order')
            ->orderBy('name');
        if ($defaultMapIds !== []) {
            $mapsQuery->whereNotIn('id', $defaultMapIds);
        }
        if ($instructorId) {
            $mapsQuery->where('created_by', $instructorId);
        }
        if ($search !== '') {
            $mapsQuery->where(function ($q) use ($search) {
                $q->where('name', 'like', '%'.$search.'%')
                    ->orWhere('description', 'like', '%'.$search.'%');
            });
        }

        $maps = $mapsQuery->get();
        $mapIds = $maps->pluck('id')->map(fn ($id) => (int) $id)->all();
        $testsByMap = $this->testsGroupedByMap($mapIds, $instructorId);
        $allTestIds = collect($testsByMap)->flatMap(fn ($ids) => $ids)->unique()->values()->all();
        $questionCounts = $this->questionCountsForTests($allTestIds);

        $payload = $maps->map(function (CourseMap $map) use ($testsByMap, $questionCounts) {
            $testIds = $testsByMap[(int) $map->id] ?? [];

            return [
                'id' => (int) $map->id,
                'name' => $map->name,
                'description' => $map->description,
                'cover_image_url' => $map->cover_image_url,
                'accent_color' => $map->accent_color,
                'courses_count' => (int) $map->courses_count,
                'tests_count' => count($testIds),
                'questions_count' => $this->sumQuestionCounts($testIds, $questionCounts),
                'is_virtual' => false,
            ];
        })->values();

        $unassigned = $this->unassignedBucket($instructorId, $search);
        if ($unassigned !== null) {
            $payload->push($unassigned);
        }

        return response()->json(['data' => $payload]);
    }

    public function tests(Request $request, $mapId)
    {
        $instructorId = auth()->user()->isInstructor() ? (int) auth()->id() : null;
        $search = trim((string) $request->input('search', ''));

        if ((string) $mapId === 'unassigned') {
            $testIds = $this->unassignedTestIds($instructorId);
            $mapName = CourseMapBuckets::defaultMapRecord()?->name ?? 'Fără mapă';
        } else {
            $map = CourseMap::query()->findOrFail($mapId);
            if ($instructorId && (int) $map->created_by !== $instructorId) {
                abort(403, 'Acces interzis. Poți accesa doar mapele tale.');
            }
            $testIds = $this->testsGroupedByMap([(int) $map->id], $instructorId)[(int) $map->id] ?? [];
            $mapName = $map->name;
        }

        $tests = Test::query()
            ->whereIn('id', $testIds)
            ->with(['courses:id,title'])
            ->withCount('questions')
            ->orderBy('title')
            ->get();

        $questionCounts = $this->questionCountsForTests($tests->pluck('id')->all());

        $rows = $tests->map(function (Test $test) use ($questionCounts, $search) {
            $courseTitles = $test->courses->pluck('title')->filter()->unique()->values()->all();
            $row = [
                'id' => (int) $test->id,
                'title' => $test->title,
                'description' => $test->description,
                'status' => $test->status,
                'question_source' => $test->question_source,
                'questions_count' => $questionCounts[(int) $test->id] ?? (int) $test->questions_count,
                'courses' => $test->courses->map(fn ($course) => [
                    'id' => (int) $course->id,
                    'title' => $course->title,
                ])->values()->all(),
                'courses_label' => implode(', ', $courseTitles),
            ];
            if ($search === '') {
                return $row;
            }
            $haystack = mb_strtolower($test->title.' '.$test->description.' '.implode(' ', $courseTitles));
            return str_contains($haystack, mb_strtolower($search)) ? $row : null;
        })->filter()->values();

        return response()->json([
            'map' => [
                'id' => (string) $mapId === 'unassigned' ? 'unassigned' : (int) $mapId,
                'name' => $mapName,
            ],
            'data' => $rows,
        ]);
    }

    /**
     * @param  array<int>  $mapIds
     * @return array<int, array<int>>
     */
    private function testsGroupedByMap(array $mapIds, ?int $instructorId): array
    {
        if ($mapIds === []) {
            return [];
        }

        $links = DB::table('course_map_course as cmc')
            ->join('course_test as ct', 'ct.course_id', '=', 'cmc.course_id')
            ->join('tests as t', 't.id', '=', 'ct.test_id')
            ->whereIn('cmc.course_map_id', $mapIds)
            ->when($instructorId, fn ($q) => $q->where('t.created_by', $instructorId))
            ->whereNull('t.deleted_at')
            ->get(['cmc.course_map_id', 'ct.test_id']);

        $grouped = [];
        foreach ($links as $row) {
            $grouped[(int) $row->course_map_id][(int) $row->test_id] = (int) $row->test_id;
        }

        return array_map(fn ($ids) => array_values($ids), $grouped);
    }

    /**
     * @param  array<int>  $testIds
     * @return array<int, int>
     */
    private function questionCountsForTests(array $testIds): array
    {
        if ($testIds === []) {
            return [];
        }

        $tests = Test::query()
            ->whereIn('id', $testIds)
            ->get(['id', 'question_source', 'question_set_id']);

        $directIds = $tests->where('question_source', '!=', 'bank')->pluck('id')->all();
        $bankIds = $tests->where('question_source', 'bank')->pluck('question_set_id')->filter()->unique()->all();

        $directCounts = $directIds === []
            ? collect()
            : Question::query()
                ->whereIn('test_id', $directIds)
                ->selectRaw('test_id, COUNT(*) as aggregate')
                ->groupBy('test_id')
                ->pluck('aggregate', 'test_id');

        $bankCounts = $bankIds === []
            ? collect()
            : Question::query()
                ->whereIn('question_bank_id', $bankIds)
                ->selectRaw('question_bank_id, COUNT(*) as aggregate')
                ->groupBy('question_bank_id')
                ->pluck('aggregate', 'question_bank_id');

        $out = [];
        foreach ($tests as $test) {
            if ($test->question_source === 'bank') {
                $out[(int) $test->id] = (int) ($bankCounts[$test->question_set_id] ?? 0);
            } else {
                $out[(int) $test->id] = (int) ($directCounts[$test->id] ?? 0);
            }
        }

        return $out;
    }

    /**
     * @param  array<int>  $testIds
     * @param  array<int, int>  $questionCounts
     */
    private function sumQuestionCounts(array $testIds, array $questionCounts): int
    {
        $sum = 0;
        foreach ($testIds as $id) {
            $sum += (int) ($questionCounts[$id] ?? 0);
        }

        return $sum;
    }

    private function unassignedBucket(?int $instructorId, string $search): ?array
    {
        $testIds = $this->unassignedTestIds($instructorId);
        if ($testIds === []) {
            return null;
        }

        $name = CourseMapBuckets::defaultMapRecord()?->name ?? 'Fără mapă';
        if ($search !== '' && ! str_contains(mb_strtolower($name), mb_strtolower($search))) {
            return null;
        }

        $questionCounts = $this->questionCountsForTests($testIds);
        $courseCount = CourseMapBuckets::defaultBucketQuery(publishedOnly: false)
            ->when($instructorId, fn ($q) => $q->where('teacher_id', $instructorId))
            ->count();

        return [
            'id' => 'unassigned',
            'name' => $name,
            'description' => 'Teste din cursuri fără mapă sau neatașate unui curs.',
            'cover_image_url' => null,
            'accent_color' => '#64748b',
            'courses_count' => $courseCount,
            'tests_count' => count($testIds),
            'questions_count' => $this->sumQuestionCounts($testIds, $questionCounts),
            'is_virtual' => true,
        ];
    }

    /**
     * @return array<int>
     */
    private function unassignedTestIds(?int $instructorId): array
    {
        $defaultMapIds = CourseMapBuckets::defaultMapIds();
        $organizedCourseIds = DB::table('course_map_course')
            ->when($defaultMapIds !== [], fn ($q) => $q->whereNotIn('course_map_id', $defaultMapIds))
            ->pluck('course_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $linkedToOrganized = $organizedCourseIds === []
            ? []
            : DB::table('course_test')
                ->whereIn('course_id', $organizedCourseIds)
                ->pluck('test_id')
                ->map(fn ($id) => (int) $id)
                ->all();

        $query = Test::query()->select('tests.id');
        if ($instructorId) {
            $query->where('created_by', $instructorId);
        }
        if ($linkedToOrganized !== []) {
            $query->whereNotIn('tests.id', array_values(array_unique($linkedToOrganized)));
        }

        return $query->pluck('id')->map(fn ($id) => (int) $id)->unique()->values()->all();
    }
}
