<?php

namespace App\Models;

use App\Models\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class MediaAsset extends Model
{
    use BelongsToCompany, HasFactory;

    protected $fillable = [
        'company_id',
        'course_id',
        'uploaded_by_user_id',
        'disk',
        'type',
        'path',
        'filename',
        'mime_type',
        'size',
    ];

    protected $casts = [
        'size' => 'integer',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }

    /**
     * Token for the public preview link /api/builder-media/{courseId}/{mediaId}?token=…
     */
    public static function previewToken(int $courseId, int $mediaId): string
    {
        return hash_hmac('sha256', "{$courseId}|{$mediaId}", (string) config('app.key'));
    }

    public function getUrlAttribute(): ?string
    {
        $disk = $this->disk ?: 'public';
        if (!$this->path) return null;
        return Storage::disk($disk)->url($this->path);
    }
}

