<?php

namespace App\Jobs;

use App\Models\Course;
use App\Services\CourseProgressService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUniqueUntilProcessing;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Recalculează progresul tuturor cursanților unui curs după o schimbare de structură
 * (lecție/modul salvat, șters sau reordonat).
 *
 * Rulează în coadă, nu în cererea adminului, și o singură dată pe curs: salvările
 * automate din builder care vin una după alta se adună într-o singură recalculare.
 * Progresul fiecărui cursant se recalculează oricum și când își deschide cursul.
 */
class RecalculateCourseProgressJob implements ShouldQueue, ShouldBeUniqueUntilProcessing
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** Secunde de așteptare, ca salvările apropiate să producă un singur job. */
    public const DEBOUNCE_SECONDS = 15;

    public int $tries = 3;

    public int $uniqueFor = 600;

    public function __construct(public int $courseId)
    {
    }

    public static function queueFor(?int $courseId): void
    {
        if (! $courseId) {
            return;
        }

        static::dispatch($courseId)->delay(now()->addSeconds(self::DEBOUNCE_SECONDS));
    }

    public function uniqueId(): string
    {
        return (string) $this->courseId;
    }

    public function handle(CourseProgressService $progressService): void
    {
        $course = Course::find($this->courseId);
        if ($course) {
            $progressService->recalculateCourseProgress($course);
        }
    }
}
