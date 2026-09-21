<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CourseMap extends Model
{
    use BelongsToCompany, HasFactory;

    protected $fillable = [
        'company_id',
        'name',
        'description',
        'visibility',
        'created_by',
        'order',
        'accent_color',
        'header_bg_color',
        'header_text_color',
        'cover_image_path',
        'cover_focus',
    ];

    protected $casts = [
        'order' => 'integer',
        'cover_focus' => 'array',
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

    public static function normalizeCoverFocus(mixed $value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : [];
        }

        if (! is_array($value)) {
            $value = [];
        }

        $x = isset($value['x']) ? (float) $value['x'] : 50;
        $y = isset($value['y']) ? (float) $value['y'] : 50;
        $zoom = isset($value['zoom']) ? (float) $value['zoom'] : 1;

        return [
            'x' => max(0, min(100, $x)),
            'y' => max(0, min(100, $y)),
            'zoom' => max(1, min(2.5, $zoom)),
        ];
    }

    public function setCoverFocusAttribute($value): void
    {
        $this->attributes['cover_focus'] = $value === null
            ? null
            : json_encode(self::normalizeCoverFocus($value));
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
