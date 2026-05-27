<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class MessageController extends Controller
{
    private static ?bool $hasConversationParticipantsTable = null;

    private function hasConversationParticipantsTable(): bool
    {
        if (self::$hasConversationParticipantsTable === null) {
            self::$hasConversationParticipantsTable = Schema::hasTable('conversation_participants');
        }

        return self::$hasConversationParticipantsTable;
    }

    private function participantGroupRole(Conversation $conversation, User $participant): string
    {
        $gr = $participant->pivot->group_role ?? null;
        if (is_string($gr) && $gr !== '') {
            return $gr;
        }
        if ((int) $participant->id === (int) $conversation->created_by) {
            return 'owner';
        }

        return 'member';
    }

    private function mapGroupParticipantForApi(Conversation $conversation, User $participant): array
    {
        $gr = $this->participantGroupRole($conversation, $participant);

        return [
            'id' => $participant->id,
            'name' => $participant->name,
            'email' => $participant->email,
            'avatar' => $participant->avatar,
            'role' => $participant->role,
            'group_role' => $gr,
            'is_owner' => $gr === 'owner',
            'is_group_admin' => $gr === 'admin',
        ];
    }

    private function canManageGroup(Conversation $conversation, User $user): bool
    {
        if (!$conversation->is_group) {
            return false;
        }

        if ((string) $user->role === 'admin') {
            return true;
        }

        $conversation->loadMissing('participants');
        $gr = $conversation->groupRoleForUser((int) $user->id);
        if (!$gr && (int) $conversation->created_by === (int) $user->id) {
            return true;
        }

        return in_array($gr, ['owner', 'admin'], true);
    }

    private function canManageGroupRoles(Conversation $conversation, User $user): bool
    {
        if (!$conversation->is_group) {
            return false;
        }

        if ((string) $user->role === 'admin') {
            return true;
        }

        $conversation->loadMissing('participants');
        $gr = $conversation->groupRoleForUser((int) $user->id);
        if (!$gr && (int) $conversation->created_by === (int) $user->id) {
            return true;
        }

        return $gr === 'owner';
    }

    /**
     * Get all conversations for the authenticated user
     */
    public function getUnreadCount(Request $request)
    {
        $user = Auth::user();
        $userId = (int) $user->id;

        // Query optimizat: obținem IDs de conversații o singură dată și evităm whereHas + orWhereHas costisitor.
        $directConversationIds = Conversation::query()
            ->where('is_group', false)
            ->where(function ($pair) use ($userId) {
                $pair->where('user1_id', $userId)
                    ->orWhere('user2_id', $userId);
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $groupConversationIds = [];
        if ($this->hasConversationParticipantsTable()) {
            $groupConversationIds = DB::table('conversation_participants')
                ->where('user_id', $userId)
                ->pluck('conversation_id')
                ->map(fn ($id) => (int) $id)
                ->all();
        }

        $conversationIds = array_values(array_unique(array_merge($directConversationIds, $groupConversationIds)));
        if (empty($conversationIds)) {
            return response()->json([
                'data' => [
                    'unreadCount' => 0,
                ],
            ]);
        }

        $count = Message::query()
            ->whereIn('conversation_id', $conversationIds)
            ->where('read', false)
            ->where('sender_id', '!=', $userId)
            ->count();

        return response()->json([
            'data' => [
                'unreadCount' => $count,
            ],
        ]);
    }

    /**
     * Get all conversations for the authenticated user
     */
    public function getConversations(Request $request)
    {
        $user = Auth::user();
        $summaryOnly = filter_var($request->query('summary', false), FILTER_VALIDATE_BOOLEAN);

        if ($summaryOnly) {
            $conversations = Conversation::query()
                ->select('id', 'last_message_at', 'updated_at')
                ->where(function ($query) use ($user) {
                    $query->where(function ($sub) use ($user) {
                        $sub->where('is_group', false)
                            ->where(function ($pair) use ($user) {
                                $pair->where('user1_id', $user->id)
                                    ->orWhere('user2_id', $user->id);
                            });
                    });

                    if ($this->hasConversationParticipantsTable()) {
                        $query->orWhereHas('participants', function ($p) use ($user) {
                            $p->where('users.id', $user->id);
                        });
                    }
                })
                ->orderByDesc('last_message_at')
                ->get();

            if ($conversations->isEmpty()) {
                return response()->json([
                    'data' => [],
                ]);
            }

            $conversationIds = $conversations->pluck('id')->map(fn ($id) => (int) $id)->all();
            $unreadByConversation = Message::query()
                ->select('conversation_id', DB::raw('COUNT(*) as unread_count'))
                ->whereIn('conversation_id', $conversationIds)
                ->where('sender_id', '!=', $user->id)
                ->where('read', false)
                ->groupBy('conversation_id')
                ->pluck('unread_count', 'conversation_id');

            $summary = $conversations->map(function ($conversation) use ($unreadByConversation) {
                $unread = (int) ($unreadByConversation[$conversation->id] ?? 0);
                return [
                    'id' => $conversation->id,
                    'unreadCount' => $unread,
                ];
            });

            return response()->json([
                'data' => $summary,
            ]);
        }

        $conversations = Conversation::query()
            ->where(function ($query) use ($user) {
                $query->where(function ($sub) use ($user) {
                    $sub->where('is_group', false)
                        ->where(function ($pair) use ($user) {
                            $pair->where('user1_id', $user->id)
                                ->orWhere('user2_id', $user->id);
                        });
                });

                if ($this->hasConversationParticipantsTable()) {
                    $query->orWhereHas('participants', function ($p) use ($user) {
                        $p->where('users.id', $user->id);
                    });
                }
            })
            ->with(['user1', 'user2', 'participants'])
            ->withCount(['messages as unread_count' => function ($query) use ($user) {
                $query->where('sender_id', '!=', $user->id)
                      ->where('read', false);
            }])
            ->orderBy('last_message_at', 'desc')
            ->get()
            ->map(function ($conversation) use ($user) {
                $lastMessage = $conversation->getLastMessage();
                $isGroup = (bool) $conversation->is_group;
                $participant = !$isGroup ? $conversation->getOtherParticipant($user->id) : null;
                $groupParticipants = $isGroup
                    ? $conversation->participants
                        ->where('id', '!=', $user->id)
                        ->values()
                        ->map(fn ($p) => $this->mapGroupParticipantForApi($conversation, $p))->all()
                    : [];

                return [
                    'id' => $conversation->id,
                    'is_group' => $isGroup,
                    'name' => $isGroup ? ($conversation->name ?: 'Grup fără nume') : null,
                    'participant' => $participant ? [
                        'id' => $participant->id,
                        'name' => $participant->name,
                        'email' => $participant->email,
                        'avatar' => $participant->avatar,
                        'role' => $participant->role,
                    ] : null,
                    'participants' => $groupParticipants,
                    'lastMessage' => $lastMessage ? [
                        'content' => $lastMessage->content,
                        'created_at' => $lastMessage->created_at->toISOString(),
                        'sender_id' => $lastMessage->sender_id,
                    ] : null,
                    'unreadCount' => $conversation->unread_count ?? 0,
                    'updated_at' => $conversation->last_message_at 
                        ? $conversation->last_message_at->toISOString() 
                        : $conversation->updated_at->toISOString(),
                ];
            });

        return response()->json([
            'data' => $conversations,
        ]);
    }

    /**
     * Get messages for a specific conversation
     */
    public function getMessages(Request $request, $conversationId)
    {
        $user = Auth::user();

        $conversation = Conversation::with('participants')->findOrFail($conversationId);
        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }

        $messages = Message::where('conversation_id', $conversationId)
            ->with('sender')
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function ($message) use ($user) {
                return [
                    'id' => $message->id,
                    'content' => $message->content,
                    'sender_id' => $message->sender_id,
                    'sender_name' => $message->sender?->name,
                    'sender' => $message->sender ? [
                        'id' => $message->sender->id,
                        'name' => $message->sender->name,
                    ] : null,
                    'mine' => (int) $message->sender_id === (int) $user->id,
                    'created_at' => $message->created_at->toISOString(),
                    'read' => $message->read,
                ];
            });

        return response()->json([
            'data' => $messages,
        ]);
    }

    /**
     * Send a message in a conversation
     */
    public function sendMessage(Request $request, $conversationId)
    {
        $user = Auth::user();

        $conversation = Conversation::with('participants')->findOrFail($conversationId);
        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }

        $validator = Validator::make($request->all(), [
            'content' => 'required|string|max:5000',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $message = Message::create([
            'conversation_id' => $conversationId,
            'sender_id' => $user->id,
            'content' => $request->content,
            'read' => false,
        ]);

        // Update conversation's last_message_at
        $conversation->update([
            'last_message_at' => now(),
        ]);

        try {
            app(\App\Services\NotificationService::class)->notifyNewMessage(
                $user,
                $conversation->fresh(['participants']),
                (string) $request->content
            );
        } catch (\Throwable $e) {
            \Log::warning('MessageController::sendMessage notifyNewMessage failed', [
                'conversation_id' => $conversationId,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'data' => [
                'id' => $message->id,
                'content' => $message->content,
                'sender_id' => $message->sender_id,
                'sender_name' => $user->name,
                'sender' => [
                    'id' => $user->id,
                    'name' => $user->name,
                ],
                'mine' => true,
                'created_at' => $message->created_at->toISOString(),
                'read' => $message->read,
            ],
        ], 201);
    }

    /**
     * Create a new conversation
     */
    public function createConversation(Request $request)
    {
        $user = Auth::user();

        $validator = Validator::make($request->all(), [
            'type' => 'nullable|in:direct,group',
            'participant_id' => 'nullable|exists:users,id',
            'participant_ids' => 'nullable|array',
            'participant_ids.*' => 'integer|exists:users,id',
            'name' => 'nullable|string|max:120',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $type = (string) ($request->input('type') ?: 'direct');

        if ($type === 'group') {
            $participantIds = collect($request->input('participant_ids', []))
                ->map(fn ($id) => (int) $id)
                ->filter(fn ($id) => $id > 0 && $id !== (int) $user->id)
                ->unique()
                ->values();

            if ($participantIds->count() < 2) {
                return response()->json([
                    'message' => 'Un grup necesită cel puțin 2 participanți.',
                ], 422);
            }

            $conversation = DB::transaction(function () use ($user, $participantIds, $request) {
                $anchorUser2 = (int) $participantIds->first();
                $conv = Conversation::create([
                    'user1_id' => $user->id,
                    'user2_id' => $anchorUser2,
                    'is_group' => true,
                    'name' => trim((string) ($request->input('name') ?: 'Grup nou')),
                    'created_by' => $user->id,
                    'last_message_at' => now(),
                ]);

                $allParticipantIds = $participantIds->push((int) $user->id)->unique()->values()->all();
                $now = now();
                $attachPayload = [];
                foreach ($allParticipantIds as $pid) {
                    $attachPayload[$pid] = [
                        'group_role' => (int) $pid === (int) $user->id ? 'owner' : 'member',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
                $conv->participants()->attach($attachPayload);

                return $conv->fresh(['participants']);
            });

            $groupParticipants = $conversation->participants
                ->where('id', '!=', $user->id)
                ->values()
                ->map(fn ($p) => $this->mapGroupParticipantForApi($conversation, $p))->all();

            return response()->json([
                'data' => [
                    'id' => $conversation->id,
                    'is_group' => true,
                    'name' => $conversation->name,
                    'participant' => null,
                    'participants' => $groupParticipants,
                    'lastMessage' => null,
                    'unreadCount' => 0,
                    'updated_at' => $conversation->updated_at->toISOString(),
                ],
            ], 201);
        }

        $participantId = (int) $request->participant_id;
        if (!$participantId) {
            return response()->json(['message' => 'participant_id este obligatoriu.'], 422);
        }
        if ($participantId === (int) $user->id) {
            return response()->json(['message' => 'Cannot create conversation with yourself'], 422);
        }

        $conversation = Conversation::findOrCreateBetween($user->id, $participantId);
        $participant = $conversation->getOtherParticipant($user->id);

        return response()->json([
            'data' => [
                'id' => $conversation->id,
                'is_group' => false,
                'name' => null,
                'participant' => [
                    'id' => $participant->id,
                    'name' => $participant->name,
                    'email' => $participant->email,
                    'avatar' => $participant->avatar,
                    'role' => $participant->role,
                ],
                'participants' => [],
                'lastMessage' => null,
                'unreadCount' => 0,
                'updated_at' => $conversation->updated_at->toISOString(),
            ],
        ], 201);
    }

    /**
     * Search conversations
     */
    public function searchConversations(Request $request)
    {
        $user = Auth::user();
        $query = $request->input('q', '');

        if (empty($query)) {
            return response()->json([
                'data' => [],
            ]);
        }

        // Get conversations and filter by participant name or message content
        $conversations = Conversation::where(function ($q) use ($user) {
                $q->where(function ($sub) use ($user) {
                    $sub->where('is_group', false)
                        ->where(function ($pair) use ($user) {
                            $pair->where('user1_id', $user->id)
                                ->orWhere('user2_id', $user->id);
                        });
                });
                if ($this->hasConversationParticipantsTable()) {
                    $q->orWhereHas('participants', function ($p) use ($user) {
                        $p->where('users.id', $user->id);
                    });
                }
            })
            ->with(['user1', 'user2', 'participants'])
            ->get()
            ->filter(function ($conversation) use ($user, $query) {
                $lastMessage = $conversation->getLastMessage();
                $isGroup = (bool) $conversation->is_group;

                $matchesName = false;
                $matchesEmail = false;
                if ($isGroup) {
                    $matchesName = stripos((string) $conversation->name, $query) !== false
                        || $conversation->participants->contains(function ($p) use ($query, $user) {
                            return (int) $p->id !== (int) $user->id
                                && stripos((string) $p->name, $query) !== false;
                        });
                } else {
                    $participant = $conversation->getOtherParticipant($user->id);
                    $matchesName = $participant && stripos($participant->name, $query) !== false;
                    $matchesEmail = $participant && stripos($participant->email, $query) !== false;
                }
                $matchesMessage = $lastMessage && stripos($lastMessage->content, $query) !== false;
                
                return $matchesName || $matchesEmail || $matchesMessage;
            })
            ->map(function ($conversation) use ($user) {
                $lastMessage = $conversation->getLastMessage();
                $isGroup = (bool) $conversation->is_group;
                $participant = !$isGroup ? $conversation->getOtherParticipant($user->id) : null;
                $groupParticipants = $isGroup
                    ? $conversation->participants
                        ->where('id', '!=', $user->id)
                        ->values()
                        ->map(fn ($p) => $this->mapGroupParticipantForApi($conversation, $p))->all()
                    : [];

                return [
                    'id' => $conversation->id,
                    'is_group' => $isGroup,
                    'name' => $isGroup ? ($conversation->name ?: 'Grup fără nume') : null,
                    'participant' => $participant ? [
                        'id' => $participant->id,
                        'name' => $participant->name,
                        'email' => $participant->email,
                        'avatar' => $participant->avatar,
                        'role' => $participant->role,
                    ] : null,
                    'participants' => $groupParticipants,
                    'lastMessage' => $lastMessage ? [
                        'content' => $lastMessage->content,
                        'created_at' => $lastMessage->created_at->toISOString(),
                        'sender_id' => $lastMessage->sender_id,
                    ] : null,
                    'unreadCount' => $conversation->getUnreadCount($user->id),
                    'updated_at' => $conversation->last_message_at 
                        ? $conversation->last_message_at->toISOString() 
                        : $conversation->updated_at->toISOString(),
                ];
            })
            ->values();

        return response()->json([
            'data' => $conversations,
        ]);
    }

    /**
     * Mark conversation as read
     */
    public function markAsRead(Request $request, $conversationId)
    {
        $user = Auth::user();

        $conversation = Conversation::with('participants')->findOrFail($conversationId);
        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }

        // Mark all messages from other participant as read
        Message::where('conversation_id', $conversationId)
            ->where('sender_id', '!=', $user->id)
            ->where('read', false)
            ->update([
                'read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'message' => 'Conversation marked as read',
        ]);
    }

    /**
     * Get available users for new conversation (users you can message)
     */
    public function getAvailableUsers(Request $request)
    {
        $user = Auth::user();
        $query = $request->input('q', '');

        $users = User::where('id', '!=', $user->id)
            ->when($query, function ($q) use ($query) {
                $q->where(function ($queryBuilder) use ($query) {
                    $queryBuilder->where('name', 'like', "%{$query}%")
                                 ->orWhere('email', 'like', "%{$query}%");
                });
            })
            ->select('id', 'name', 'email', 'avatar', 'role')
            ->limit(20)
            ->get();

        return response()->json([
            'data' => $users,
        ]);
    }

    public function getParticipants(Request $request, $conversationId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }
        if (!$conversation->is_group) {
            return response()->json(['message' => 'Conversația nu este de tip grup.'], 422);
        }

        return response()->json([
            'data' => $conversation->participants
                ->values()
                ->map(function ($participant) use ($conversation) {
                    $row = $this->mapGroupParticipantForApi($conversation, $participant);
                    $row['is_creator'] = (int) $participant->id === (int) $conversation->created_by;

                    return $row;
                }),
            'meta' => [
                'conversation_id' => $conversation->id,
                'is_group' => true,
                'name' => $conversation->name ?: 'Grup fără nume',
            ],
        ]);
    }

    public function addParticipants(Request $request, $conversationId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }
        if (!$this->canManageGroup($conversation, $user)) {
            abort(403, 'Nu ai permisiunea să modifici participanții acestui grup.');
        }

        $validator = Validator::make($request->all(), [
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'integer|exists:users,id',
        ]);
        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $userIds = collect($request->input('user_ids', []))
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        $existing = $conversation->participants->pluck('id')->map(fn ($id) => (int) $id)->all();
        $toAttach = $userIds->filter(fn ($id) => !in_array($id, $existing, true))->values();
        if ($toAttach->isNotEmpty()) {
            $now = now();
            $payload = [];
            foreach ($toAttach as $uid) {
                $payload[$uid] = [
                    'group_role' => 'member',
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            $conversation->participants()->attach($payload);
        }

        $conversation->touch();

        return $this->getParticipants($request, $conversation->id);
    }

    public function removeParticipant(Request $request, $conversationId, $userId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }
        if (!$this->canManageGroup($conversation, $user)) {
            abort(403, 'Nu ai permisiunea să modifici participanții acestui grup.');
        }
        if (!$conversation->is_group) {
            return response()->json(['message' => 'Conversația nu este de tip grup.'], 422);
        }

        $targetUserId = (int) $userId;
        $targetParticipant = $conversation->participants->firstWhere('id', $targetUserId);
        $targetGroupRole = $targetParticipant
            ? $this->participantGroupRole($conversation, $targetParticipant)
            : null;
        if ($targetGroupRole === 'owner') {
            return response()->json([
                'message' => 'Proprietarul grupului nu poate fi eliminat.',
            ], 422);
        }

        $currentIds = $conversation->participants->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (!in_array($targetUserId, $currentIds, true)) {
            return response()->json(['message' => 'Participantul nu există în grup.'], 404);
        }
        if (count($currentIds) <= 3) {
            return response()->json([
                'message' => 'Grupul trebuie să rămână cu cel puțin 3 membri (inclusiv creator).',
            ], 422);
        }

        $conversation->participants()->detach($targetUserId);
        $conversation->touch();

        return $this->getParticipants($request, $conversation->id);
    }

    /**
     * Rename a group conversation (owner, group admin, or site admin).
     */
    public function updateConversation(Request $request, $conversationId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }
        if (!$conversation->is_group) {
            return response()->json(['message' => 'Conversația nu este de tip grup.'], 422);
        }
        if (!$this->canManageGroup($conversation, $user)) {
            abort(403, 'Nu ai permisiunea să modifici acest grup.');
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:120',
        ]);
        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $conversation->update([
            'name' => trim((string) $request->input('name')),
        ]);

        return response()->json([
            'data' => [
                'id' => $conversation->id,
                'name' => $conversation->name,
            ],
        ]);
    }

    /**
     * Current user leaves a group (not allowed for owner or when group would drop below 3 members).
     */
    public function leaveGroup(Request $request, $conversationId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }
        if (!$conversation->is_group) {
            return response()->json(['message' => 'Conversația nu este de tip grup.'], 422);
        }

        $self = $conversation->participants->firstWhere('id', $user->id);
        $gr = $self ? $this->participantGroupRole($conversation, $self) : null;
        if ($gr === 'owner') {
            return response()->json([
                'message' => 'Proprietarul nu poate părăsi grupul. Transmite proprietatea sau șterge grupul.',
            ], 422);
        }

        $currentIds = $conversation->participants->pluck('id')->map(fn ($id) => (int) $id)->all();
        if (count($currentIds) <= 3) {
            return response()->json([
                'message' => 'Grupul trebuie să aibă cel puțin 3 membri. Nu poți părăsi acum.',
            ], 422);
        }

        $conversation->participants()->detach((int) $user->id);
        $conversation->touch();

        return response()->json(['message' => 'Ai părăsit grupul.']);
    }

    /**
     * Delete a conversation.
     * - direct: any participant can delete the full conversation
     * - group: only owner/group admin/site admin can delete the full group chat
     */
    public function destroyConversation(Request $request, $conversationId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }

        if ($conversation->is_group && !$this->canManageGroup($conversation, $user)) {
            abort(403, 'Nu ai permisiunea să ștergi acest grup. Poți doar să îl părăsești.');
        }

        DB::transaction(function () use ($conversation) {
            Message::where('conversation_id', $conversation->id)->delete();
            if ($this->hasConversationParticipantsTable()) {
                $conversation->participants()->detach();
            }
            $conversation->delete();
        });

        return response()->json([
            'message' => $conversation->is_group
                ? 'Conversația de grup a fost ștearsă.'
                : 'Conversația a fost ștearsă.',
        ]);
    }

    /**
     * Set group_role to admin or member (owner or site admin only; never change owner).
     */
    public function updateParticipantGroupRole(Request $request, $conversationId, $userId)
    {
        $user = Auth::user();
        $conversation = Conversation::with('participants')->findOrFail($conversationId);

        if (!$conversation->hasParticipant((int) $user->id)) {
            abort(403, 'Nu ai acces la această conversație.');
        }
        if (!$this->canManageGroupRoles($conversation, $user)) {
            abort(403, 'Doar proprietarul poate modifica rolurile membrilor.');
        }
        if (!$conversation->is_group) {
            return response()->json(['message' => 'Conversația nu este de tip grup.'], 422);
        }

        $validator = Validator::make($request->all(), [
            'group_role' => 'required|in:admin,member',
        ]);
        if ($validator->fails()) {
            return response()->json([
                'message' => 'Validation failed',
                'errors' => $validator->errors(),
            ], 422);
        }

        $targetUserId = (int) $userId;
        $targetParticipant = $conversation->participants->firstWhere('id', $targetUserId);
        if (!$targetParticipant) {
            return response()->json(['message' => 'Participantul nu există în grup.'], 404);
        }

        $currentRole = $this->participantGroupRole($conversation, $targetParticipant);
        if ($currentRole === 'owner') {
            return response()->json(['message' => 'Rolul proprietarului nu poate fi modificat.'], 422);
        }

        $newRole = (string) $request->input('group_role');
        $conversation->participants()->updateExistingPivot($targetUserId, [
            'group_role' => $newRole,
        ]);

        $conversation->touch();

        return $this->getParticipants($request, $conversation->id);
    }
}
