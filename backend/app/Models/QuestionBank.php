<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * QuestionBank Model
 * 
 * Reusable question sets that can be used across multiple tests
 */
class QuestionBank extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'title',
        'description',
        'status',
        'created_by',
    ];

    /**
     * Get the user who created this question bank
     */
    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get questions in this bank
     */
    public function questions()
    {
        return $this->hasMany(Question::class, 'question_bank_id')->orderBy('order');
    }

    public function starredQuestions()
    {
        return $this->hasMany(Question::class, 'question_bank_id')->where('is_starred', true);
    }

    public function tags()
    {
        return $this->belongsToMany(Tag::class, 'question_bank_tag')
            ->withTimestamps();
    }

    /**
     * Get tests using this question bank
     */
    public function tests()
    {
        return $this->hasMany(Test::class, 'question_set_id');
    }

    /**
     * Check if question bank is published
     */
    public function isPublished(): bool
    {
        return $this->status === 'published';
    }
}

