<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\AiDataExportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AIExportAdminController extends Controller
{
    use \App\Http\Controllers\Concerns\AssertsPlanEntitlements;

    public function __construct(
        private AiDataExportService $exportService
    ) {
        if (auth()->check() && auth()->user()->isInstructor()) {
            abort(403, 'Doar administratorii pot genera exporturi AI.');
        }
    }

    public function datasets()
    {
        $this->assertCompanyFeature('ai_stats');

        return response()->json([
            'datasets' => $this->exportService->getDatasetCatalog(),
        ]);
    }

    public function generate(Request $request)
    {
        $this->assertCompanyFeature('ai_stats');

        $validated = $request->validate([
            'prompt' => 'required|string|min:3|max:2000',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date|after_or_equal:date_from',
        ]);

        try {
            $export = $this->exportService->generateFromPrompt(
                $validated['prompt'],
                [
                    'date_from' => $validated['date_from'] ?? null,
                    'date_to' => $validated['date_to'] ?? null,
                ]
            );

            return response()->json($export);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => $e->getMessage()], 422);
        } catch (\RuntimeException $e) {
            Log::warning('AI export failed', ['message' => $e->getMessage()]);

            return response()->json(['error' => $e->getMessage()], 503);
        } catch (\Throwable $e) {
            Log::error('AI export unexpected error', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error' => config('app.debug') ? $e->getMessage() : 'Nu s-a putut genera exportul.',
            ], 500);
        }
    }
}
