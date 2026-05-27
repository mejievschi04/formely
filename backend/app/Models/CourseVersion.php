<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class CourseVersion extends Model
{
    protected $fillable = [
        'course_id',
        'version',
        'status',
        'created_by',
    ];

    protected $casts = [
        'version' => 'integer',
    ];

    public function course(): BelongsTo
    {
        return $this->belongsTo(Course::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function snapshot(): HasOne
    {
        return $this->hasOne(CourseVersionSnapshot::class);
    }
}

