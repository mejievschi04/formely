<?php

namespace App\Models;

use App\Models\Message;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Conversation extends Model
{
    use HasFactory;

    protected $fillable = [
        'user1_id',
        'user2_id',
        'is_group',
        'name',
        'created_by',
        'last_message_at',
    ];

    protected $casts = [
        'is_group' => 'boolean',
        'last_message_at' => 'datetime',
    ];

    /**
     * Get the first user in the conversation
     */
    public function user1(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user1_id');
    }

    /**
     * Get the second user in the conversation
     */
    public function user2(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user2_id');
    }

    /**
     * Get all messages in this conversation
     */
    public function messages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('created_at', 'asc');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'conversation_participants')
            ->withPivot('group_role')
            ->withTimestamps();
    }

    public function groupRoleForUser(int $userId): ?string
    {
        if (!$this->is_group) {
            return null;
        }
        $row = $this->participants->firstWhere('id', $userId);
        $gr = $row?->pivot?->group_role;
        if (is_string($gr) && $gr !== '') {
            return $gr;
        }
        if ((int) $userId === (int) $this->created_by) {
            return 'owner';
        }

        return 'member';
    }

    /**
     * Get the other participant (not the current user)
     */
    public function getOtherParticipant($userId)
    {
        if ($this->is_group) {
            return null;
        }
        if ($this->user1_id == $userId) {
            return $this->user2;
        }
        return $this->user1;
    }

    public function hasParticipant(int $userId): bool
    {
        if ($this->is_group) {
            return $this->participants()->where('users.id', $userId)->exists();
        }

        return (int) $this->user1_id === $userId || (int) $this->user2_id === $userId;
    }

    /**
     * Get unread messages count for a specific user
     */
    public function getUnreadCount($userId)
    {
        return $this->messages()
            ->where('sender_id', '!=', $userId)
            ->where('read', false)
            ->count();
    }

    /**
     * Get the last message in the conversation
     */
    public function getLastMessage()
    {
        return Message::query()
            ->where('conversation_id', $this->id)
            ->latest('created_at')
            ->latest('id')
            ->first();
    }

    /**
     * Find or create a conversation between two users
     */
    public static function findOrCreateBetween($userId1, $userId2)
    {
        // Ensure consistent ordering (smaller ID first)
        $user1Id = min($userId1, $userId2);
        $user2Id = max($userId1, $userId2);

        return static::firstOrCreate(
            [
                'user1_id' => $user1Id,
                'user2_id' => $user2Id,
                'is_group' => false,
            ],
            [
                'last_message_at' => now(),
            ]
        );
    }
}
