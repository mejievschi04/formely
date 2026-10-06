<?php

namespace App\Support;


final class CourseUserPivot
{
    /**
     * @return list<string>
     */
    public static function columns(): array
    {
        $columns = [
            'is_mandatory',
            'assigned_at',
            'enrolled',
            'enrolled_at',
            'started_at',
            'completed_at',
            'progress_percentage',
        ];

        if (SchemaCache::hasTable('course_user') && SchemaCache::hasColumn('course_user', 'assignment_source')) {
            $columns[] = 'assignment_source';
        }

        return $columns;
    }
}
