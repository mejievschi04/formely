<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AiChunk extends Model
{
    use HasFactory;

    protected $fillable = [
        'course_id',
        'module_id',
        'lesson_id',
        'content_block_id',
        'source_type',
        'chunk_index',
        'token_count',
        'content',
        'content_hash',
        'language',
        'visible',
        'metadata',
    ];

    protected $casts = [
        'visible' => 'boolean',
        'metadata' => 'array',
        'chunk_index' => 'integer',
        'token_count' => 'integer',
    ];

    public function course()
    {
        return $this->belongsTo(Course::class);
    }

    public function module()
    {
        return $this->belongsTo(Module::class);
    }

    public function lesson()
    {
        return $this->belongsTo(Lesson::class);
    }

    public function contentBlock()
    {
        return $this->belongsTo(ContentBlock::class);
    }

    public function embeddings()
    {
        return $this->hasMany(AiEmbedding::class);
    }
}
