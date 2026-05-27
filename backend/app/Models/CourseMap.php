<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseMap extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'description',
        'visibility',
        'created_by',
        'order',
        'accent_color',
        'cover_image_path',
    ];

    protected $casts = [
        'order' => 'integer',
    ];

    protected $appends = [
        'cover_image_url',
    ];

    public function getCoverImageUrlAttribute(): ?string
    {
        $path = $this->cover_image_path ?? null;
        if (!$path) {
            return null;
        }

        return '/storage/' . ltrim($path, '/');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Cursurile din această mapă (cu ordinea din pivot).
     */
    public function courses()
    {
        return $this->belongsToMany(Course::class, 'course_map_course')
            ->withPivot('order')
            ->withTimestamps()
            ->orderByPivot('order');
    }
}
