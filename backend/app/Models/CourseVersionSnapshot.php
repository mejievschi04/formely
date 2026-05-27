<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseVersionSnapshot extends Model
{
    protected $fillable = [
        'course_version_id',
        'snapshot_json',
    ];

    protected $casts = [
        'snapshot_json' => 'array',
    ];

    public function courseVersion(): BelongsTo
    {
        return $this->belongsTo(CourseVersion::class);
    }
}

