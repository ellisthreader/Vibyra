<?php

namespace App\Services\Vibes;

use Illuminate\Support\Facades\DB;

/** Stable pagination within one owned conversation, including equal timestamps. */
final class ThreadHistory
{
    public function page(int $user, string $chat, ?string $before = null): array
    {
        DB::table('vibes_chats')->where('id', $chat)->where('user_id', $user)->firstOrFail();
        $query = DB::table('vibes_turns')->where('chat_id', $chat)->where('user_id', $user);
        if ($before !== null) {
            $cursor = (clone $query)->where('id', $before)->firstOrFail();
            $query->where(function ($q) use ($cursor) {
                $q->where('created_at', '<', $cursor->created_at)
                    ->orWhere(fn ($same) => $same->where('created_at', $cursor->created_at)->where('id', '<', $cursor->id));
            });
        }
        $rows = $query->orderByDesc('created_at')->orderByDesc('id')->limit(201)->get();
        $more = $rows->count() > 200;
        $page = $rows->take(200)->reverse()->values();
        return ['turns' => $page->map(fn ($turn) => app(Turns::class)->payload($turn))->all(),
            'hasMore' => $more, 'nextBefore' => $more ? $page->first()->id : null];
    }
}
