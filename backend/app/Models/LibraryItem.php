<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LibraryItem extends Model
{
    protected $fillable = [
        'user_id',
        'title',
        'description',
        'original_filename',
        'stored_path',
        'cover_image_path',
        'mime_type',
        'size_bytes',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
    ];

    protected $hidden = [
        'cover_image_path',
    ];

    protected $appends = [
        'cover_image_url',
    ];

    public function getCoverImageUrlAttribute(): ?string
    {
        $path = $this->cover_image_path ?? null;
        if (! $path) {
            return null;
        }

        return '/storage/' . ltrim($path, '/');
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
