<?php

namespace App\Services;

/**
 * Policy helper: never wipe an existing course until AI JSON is validated.
 * Heavy create/update logic remains in AIController until further extraction;
 * this documents and centralizes the pre-persist gate.
 */
class CourseFromAiPersister
{
    /**
     * @param  array{ok?: bool, data?: array, reasons?: list<string>}  $validation
     */
    public function readyToReplaceStructure(array $validation): bool
    {
        return ! empty($validation['ok']) && is_array($validation['data'] ?? null);
    }

    /**
     * @param  array{ok?: bool, data?: array}  $validation
     * @return array<string, mixed>|null
     */
    public function normalizedCourse(array $validation): ?array
    {
        if (! $this->readyToReplaceStructure($validation)) {
            return null;
        }

        return $validation['data'];
    }
}
