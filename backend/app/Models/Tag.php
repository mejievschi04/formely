<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Tag extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
    ];

    public function questionBanks()
    {
        return $this->belongsToMany(QuestionBank::class, 'question_bank_tag')
            ->withTimestamps();
    }
}
