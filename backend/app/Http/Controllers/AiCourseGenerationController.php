<?php

namespace App\Http\Controllers;

use App\Http\Requests\StartAiCourseGenerationRequest;
use App\Jobs\GenerateAiCourseStep;
use App\Models\AiCourseGeneration;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AiCourseGenerationController extends Controller
{
    use Concerns\AssertsPlanEntitlements;

    public function start(StartAiCourseGenerationRequest $request)
    {
        $this->assertCompanyFeature('ai_creator');
        abort_unless(in_array(config('ai.provider'), ['openai', 'groq']), 422, 'Generarea pe etape necesită un provider OpenAI-compatible.');
        abort_unless(config('ai.'.config('ai.provider').'.api_key'), 503, 'Formely AI nu este configurat.');
        $input = $request->validated();
        $key = $input['request_key'];
        unset($input['request_key']);
        $fingerprint = hash('sha256', json_encode($input));

        $run = DB::transaction(function () use ($request, $input, $key, $fingerprint) {
            // Serialize starts by actor, including requests using different keys.
            User::withoutGlobalScopes()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $existing = $this->owned($request)->where('request_key', $key)->first();
            if ($existing) {
                abort_unless(hash_equals($existing->fingerprint, $fingerprint), 409, 'Această cerere a fost deja folosită cu alte date.');
                return $existing;
            }
            $active = $this->owned($request)->whereIn('status', ['queued', 'running'])->first();
            if ($active) {
                abort_unless(hash_equals($active->fingerprint, $fingerprint), 409, 'Ai deja un curs în curs de generare. Așteaptă finalizarea lui.');
                return $active;
            }
            $this->assertAiQuotaAvailable('course_generation');
            $run = AiCourseGeneration::create([
                'id' => (string) Str::uuid7(), 'company_id' => $request->user()->company_id,
                'user_id' => $request->user()->id, 'request_key' => $key, 'fingerprint' => $fingerprint,
                'input' => $input, 'total_lessons' => $input['guided_brief']['modules_count'] * $input['guided_brief']['lessons_per_module'],
            ]);
            GenerateAiCourseStep::dispatch($run->id, -1)->beforeCommit();
            return $run;
        });
        return response()->json($run->fresh()->snapshot(), 202);
    }

    public function active(Request $request)
    {
        $run = $this->owned($request)->latest()->orderByDesc('id')->first();
        if ($run && !in_array($run->status, ['queued', 'running', 'failed'])) $run = null;
        return response()->json(['generation' => $run?->snapshot()]);
    }

    public function show(Request $request, string $id)
    {
        return response()->json($this->owned($request)->findOrFail($id)->snapshot());
    }

    public function retry(Request $request, string $id)
    {
        $this->assertCompanyFeature('ai_creator');
        $run = DB::transaction(function () use ($request, $id) {
            User::withoutGlobalScopes()->whereKey($request->user()->id)->lockForUpdate()->firstOrFail();
            $run = $this->owned($request)->lockForUpdate()->findOrFail($id);
            if ($run->status === 'failed') {
                abort_if($this->owned($request)->whereKeyNot($id)->whereIn('status', ['queued', 'running'])->exists(), 409, 'Ai deja alt curs în curs de generare.');
                $this->assertAiQuotaAvailable('course_generation');
                $run->update(['status' => 'queued', 'error' => null]);
                GenerateAiCourseStep::dispatch($run->id, $run->outline === null ? -1 : $run->completed_lessons)->beforeCommit();
            }
            return $run;
        });
        return response()->json($run->snapshot(), 202);
    }

    private function owned(Request $request)
    {
        return AiCourseGeneration::query()->where('company_id', $request->user()->company_id)->where('user_id', $request->user()->id);
    }
}
