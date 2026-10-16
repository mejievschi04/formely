<?php

namespace App\Jobs;

use App\Models\AiCourseGeneration;
use App\Models\User;
use App\Services\StagedAiCourseGenerator;
use App\Support\TenantContext;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;

class GenerateAiCourseStep implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 210;
    public int $tries = 3;
    public bool $failOnTimeout = false;
    public array $backoff = [10, 30];

    public function __construct(public string $generationId, public int $expectedStep)
    {
        // Always use the durable queue, including installations with QUEUE_CONNECTION=sync.
        $this->onConnection('database');
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping('ai-course:'.$this->generationId))->releaseAfter(30)->expireAfter(240)];
    }

    public function handle(StagedAiCourseGenerator $generator): void
    {
        $run = AiCourseGeneration::withoutGlobalScopes()->find($this->generationId);
        if (!$run || !in_array($run->status, ['queued', 'running']) || $this->stepOf($run) !== $this->expectedStep) {
            return;
        }
        $previousUser = Auth::user();
        $previousCompanyId = TenantContext::companyId();
        $previousDenied = TenantContext::denyTenantData();
        try {
            $actor = User::withoutGlobalScopes()->where('company_id', $run->company_id)->findOrFail($run->user_id);
            abort_unless($actor->status === 'active' && ($actor->isAdmin() || $actor->isInstructor()), 403);
            $company = \App\Models\Company::findOrFail($run->company_id);
            abort_unless($company->isUsable() && app(\App\Services\PlanEntitlementService::class)->companyCan($company, 'ai_creator'), 403);
            TenantContext::setFromUser($actor);
            Auth::setUser($actor);
            $run->update(['status' => 'running']);
            $generator->step($run);
        } catch (\Throwable $e) {
            $message = $e instanceof \Illuminate\Validation\ValidationException
                ? 'Structura nu respectă formularul: '.implode(' ', array_slice($e->validator->errors()->all(), 0, 3))
                : ($e instanceof \RuntimeException && !$e instanceof \Illuminate\Database\QueryException ? $e->getMessage() : 'Etapa nu a putut fi finalizată. Reîncearcă; lecțiile validate sunt păstrate.');
            $run->update(['error' => mb_substr($message, 0, 1000)]);
            Log::warning('Staged AI course step failed', ['generation_id' => $run->id, 'step' => $this->expectedStep, 'exception' => get_class($e)]);
            throw $e;
        } finally {
            Auth::forgetUser();
            TenantContext::clear();
            if ($previousUser) {
                Auth::setUser($previousUser);
            }
            if ($previousDenied) TenantContext::denyAll();
            elseif ($previousCompanyId !== null) TenantContext::setCompanyId($previousCompanyId);
        }
    }

    public function failed(?\Throwable $exception): void
    {
        $run = AiCourseGeneration::withoutGlobalScopes()->find($this->generationId);
        if ($run && in_array($run->status, ['queued', 'running']) && $this->stepOf($run) === $this->expectedStep) {
            $run->update(['status' => 'failed', 'error' => $run->error ?: 'Etapa a fost întreruptă. Reîncearcă; lecțiile validate sunt păstrate.']);
        }
    }

    private function stepOf(AiCourseGeneration $run): int
    {
        return $run->outline === null ? -1 : $run->completed_lessons;
    }
}
