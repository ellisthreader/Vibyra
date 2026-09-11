<?php

namespace App\Services\Vibes;

use Illuminate\Support\Facades\DB;

class Turns
{
    public function __construct(private readonly Wallet $wallet, private readonly UsageWindows $windows) {}

    public function submit(int $userId, string $id, array $q): object
    {
        return DB::transaction(function () use ($userId, $id, $q) {
            $w = $this->wallet->lock($userId);
            $digest = hash('sha256', json_encode($q));
            $existing = DB::table('vibes_turns')->where('id', $id)->first();
            if ($existing) {
                abort_unless($existing->user_id == $userId && hash_equals($existing->digest, $digest), 409, 'This submission was already used.');
                return $existing;
            }
            abort_unless($w->consented_at, 403, 'Please accept AI data sharing before sending.');
            abort_if($q['expires'] < now()->timestamp, 409, 'Refresh the estimate before sending.');
            $chat = DB::table('vibes_chats')->where('id', $q['chatId'])->where('user_id', $userId)->firstOrFail();
            abort_unless($chat->revision == $q['revision'], 409, 'This chat changed. Refresh the estimate.');
            $active = DB::table('vibes_turns')->where('user_id', $userId)->whereNull('settled_at');
            $entitled = $w->paid_until && now()->lt($w->paid_until) ? $w->plan : 'free';
            $limit = app(Plans::class)->for($entitled)['concurrentReplies'];
            abort_if((clone $active)->count() >= $limit || (clone $active)->where('chat_id', $chat->id)->exists(), 409, 'Wait for your current reply or stop it first.');
            // Rate before balance. Both windows are checked under the wallet lock
            // taken above, so two sends racing cannot each read the same headroom
            // and each take it; and checking before the grants are decremented
            // keeps a refused turn from touching the ledger at all.
            $this->windows->guard($userId, $entitled, $q['max']);
            $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->orderBy('id')->get();
            $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
            if (!$chat->trial_slot && $paid === 0) {
                $slots = DB::table('vibes_chats')->where('user_id', $userId)->whereNotNull('trial_slot')->pluck('trial_slot')->all();
                $slot = collect(range(1, Wallet::trialChats()))->first(fn ($s) => !in_array($s, $slots));
                abort_unless($slot, 402, 'Your '.Wallet::trialChats().' free chats are used. Upgrade to keep building.');
                $chat->trial_slot = $slot;
                DB::table('vibes_chats')->where('id', $chat->id)->update(['trial_slot' => $slot]);
            }
            $trialAllowed = $chat->trial_slot && $q['trial'] ? max(0, Wallet::trialChatCredits() - $chat->trial_used) : 0;
            $remaining = $q['max']; $allocations = [];
            foreach ($grants as $g) {
                $usable = $g->kind === 'trial' ? min($g->remaining, $trialAllowed) : $g->remaining;
                $take = min($remaining, $usable);
                if ($take <= 0) continue;
                DB::table('vibes_grants')->where('id', $g->id)->decrement('remaining', $take);
                $allocations[] = ['id' => $g->id, 'amount' => $take, 'trial' => $g->kind === 'trial'];
                if ($g->kind === 'trial') $trialAllowed -= $take;
                $remaining -= $take;
            }
            abort_if($remaining > 0, 402, $q['trial'] ? 'You need more Vibes for this reply.' : 'Upgrade to use this model.');
            $day = now()->toDateString();
            DB::table('vibes_spend_days')->insertOrIgnore(['day' => $day]);
            $budget = DB::table('vibes_spend_days')->where('day', $day)->lockForUpdate()->first();
            $micro = $q['max'] * 10000;
            abort_if($budget->spent + $budget->held + $micro > config('vibes.daily_micro_usd_limit'), 503, 'AI is at capacity. Please try again later.');
            DB::table('vibes_spend_days')->where('day', $day)->increment('held', $micro);
            DB::table('vibes_turns')->insert([
                'id' => $id, 'user_id' => $userId, 'chat_id' => $chat->id, 'digest' => $digest,
                'model' => $q['model'], 'status' => 'queued', 'request' => json_encode($q['request']),
                'allocations' => json_encode($allocations), 'prompt' => $q['text'], 'reserved' => $q['max'],
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('vibes_chats')->where('id', $chat->id)->increment('revision');
            $this->wallet->record($userId, 'hold:'.$id, 'hold', -$q['max']);
            return DB::table('vibes_turns')->where('id', $id)->first();
        }, 5);
    }

    /**
     * `$absorb` settles a turn that cost real money but produced nothing the person
     * can use. They are not charged for an empty answer - Vibyra wears it - while
     * the true spend is still recorded against the daily cap. Charging zero also
     * lets the trial-slot restore below fire, so a failed first reply cannot quietly
     * consume one of the account's lifetime trial chats.
     */
    public function settle(string $id, ?int $micro, ?string $response, ?string $error = null, bool $uncertain = false, bool $absorb = false): void
    {
        $original = DB::table('vibes_turns')->where('id', $id)->firstOrFail();
        DB::transaction(function () use ($original, $micro, $response, $error, $uncertain, $absorb) {
            $this->wallet->lock($original->user_id);
            $t = DB::table('vibes_turns')->where('id', $original->id)->firstOrFail();
            if ($t->settled_at) return;
            $charge = $absorb ? 0 : min($t->reserved, max(0, (int) ceil(($micro ?? 0) / 10000)));
            $left = $charge; $trialUsed = 0;
            foreach (json_decode($t->allocations, true) as $a) {
                $used = min($left, $a['amount']); $left -= $used;
                if ($a['trial']) $trialUsed += $used;
                DB::table('vibes_grants')->where('id', $a['id'])->whereNull('revoked_at')->increment('remaining', $a['amount'] - $used);
            }
            $chat = DB::table('vibes_chats')->where('id', $t->chat_id);
            $chat->increment('trial_used', $trialUsed);
            // A failed first response does not use up an otherwise empty trial conversation.
            if (!$response && !$charge && !DB::table('vibes_turns')->where('chat_id', $t->chat_id)->whereNotNull('response')->exists()) {
                $chat->update(['trial_slot' => null]);
            }
            DB::table('vibes_turns')->where('id', $t->id)->update([
                'status' => $t->cancel_requested ? 'cancelled' : ($error ? 'failed' : 'completed'),
                'response' => $response, 'error' => $error, 'charged' => $charge,
                'actual_micro_usd' => $micro ?? 0, 'settled_at' => now(), 'updated_at' => now(),
            ]);
            $day = substr($t->created_at, 0, 10);
            DB::table('vibes_spend_days')->where('day', $day)->decrement('held', $t->reserved * 10000);
            $risk = $uncertain ? max($micro ?? 0, $t->reserved * 10000) : ($micro ?? $t->reserved * 10000);
            DB::table('vibes_spend_days')->where('day', $day)->increment('spent', $risk);
            $this->wallet->record($t->user_id, 'settle:'.$t->id, 'settlement', $t->reserved - $charge,
                ['charged' => $charge, 'actualMicroUsd' => $micro, 'unconfirmedMicroUsd' => $risk - ($micro ?? 0),
                    'absorbedMicroUsd' => max(0, ($micro ?? 0) - $charge * 10000)]);
        }, 5);
    }

    public function payload(object $t): array
    {
        return ['id' => $t->id, 'chatId' => $t->chat_id, 'model' => $t->model, 'status' => $t->status,
            'prompt' => $t->prompt, 'response' => $t->response, 'error' => $t->error,
            'tools' => app(AgentTools::class)->payload($t->id),
            'reserved' => $t->reserved, 'charged' => $t->charged, 'createdAt' => $t->created_at];
    }
}
