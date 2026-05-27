<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AiEmbedding extends Model
{
    use HasFactory;

    protected $fillable = [
        'ai_chunk_id',
        'model',
        'dimensions',
        'vector',
        'vector_hash',
    ];

    protected $casts = [
        'vector' => 'array',
        'dimensions' => 'integer',
    ];

    public function chunk()
    {
        return $this->belongsTo(AiChunk::class, 'ai_chunk_id');
    }
}
