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
            $scale = \App\Services\Membership\Units::scale($userId);
            $microPerUnit = intdiv(10000, $scale);
            app(\App\Services\Membership\Allowances::class)->refresh($userId);
            $digest = hash('sha256', json_encode($q));
            $existing = DB::table('vibes_turns')->where('id', $id)->first();
            if ($existing) {
                abort_unless($existing->user_id == $userId && hash_equals($existing->digest, $digest), 409, 'This submission was already used.');
                return $existing;
            }
            abort_unless(($q['unitScale'] ?? 1) === $scale, 409, 'Refresh the estimate after the account update.');
            abort_if(DB::table('membership_periods')->where('user_id', $userId)->where('disputed', true)->exists(), 402, 'A payment dispute needs resolving before more Vibyra-funded work. Your own AI accounts still work.');
            abort_if(DB::table('membership_periods')->where('user_id', $userId)->whereColumn('refund_requested', '>', 'refunded_minor')->exists()
                || DB::table('membership_orders')->where('user_id', $userId)->where('refund_pending', true)->exists(),
                503, 'A refund is being reconciled. Please try Vibyra-funded AI again shortly.');
            abort_unless($w->consented_at, 403, 'Please accept AI data sharing before sending.');
            abort_if($q['expires'] < now()->timestamp, 409, 'Refresh the estimate before sending.');
            $chat = DB::table('vibes_chats')->where('id', $q['chatId'])->where('user_id', $userId)->firstOrFail();
            abort_unless($chat->revision == $q['revision'], 409, 'This chat changed. Refresh the estimate.');
            app(FundedTerminals::class)->guard($userId, $chat, $q['model'], $q['max'] * $microPerUnit);
            app(\App\Services\CloudWorkspaces\Budgets::class)->guardAi($chat, $q['max']);
            app(\App\Services\CloudWorkspaces\Ai::class)->guardSubmit($chat, $q['request']);
            if (!empty($q['request']['vibyraAgent'])) \App\Services\Agents\TaskContext::validate($userId, $q['request']['vibyraAgent']);
            app(\App\Services\Membership\Projects::class)->guard($userId, $chat);
            $active = DB::table('vibes_turns')->where('user_id', $userId)->whereNull('settled_at');
            $entitled = $this->wallet->planFor($userId);
            $limit = app(Plans::class)->for($entitled)['concurrentReplies'];
            abort_if((clone $active)->count() >= $limit || (clone $active)->where('chat_id', $chat->id)->exists(), 409, 'Wait for your current reply or stop it first.');
            // Rate before balance. Both windows are checked under the wallet lock
            // taken above, so two sends racing cannot each read the same headroom
            // and each take it; and checking before the grants are decremented
            // keeps a refused turn from touching the ledger at all.
            $this->windows->guard($userId, $entitled, $q['max']);
            $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')
                ->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')->orderBy('expires_at')->orderBy('id')->get();
            $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
            if ($scale === 1 && !$chat->trial_slot && $paid === 0) {
                $slots = DB::table('vibes_chats')->where('user_id', $userId)->whereNotNull('trial_slot')->pluck('trial_slot')->all();
                $slot = collect(range(1, Wallet::trialChats()))->first(fn ($s) => !in_array($s, $slots));
                abort_unless($slot, 402, 'Your '.Wallet::trialChats().' free chats are used. Upgrade to keep building.');
                $chat->trial_slot = $slot;
                DB::table('vibes_chats')->where('id', $chat->id)->update(['trial_slot' => $slot]);
            }
            $trialAllowed = $chat->trial_slot && $q['trial'] ? max(0, Wallet::trialChatCredits() - $chat->trial_used) : 0;
            if ($scale > 1) $trialAllowed = $q['trial'] ? $q['max'] : 0;
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
            $micro = $q['max'] * $microPerUnit;
            $freeMicro = $scale > 1 && $paid === 0 ? collect($allocations)->where('trial', true)->sum('amount') * $microPerUnit : 0;
            abort_if($freeMicro > 0 && $budget->free_spent + $budget->free_held + $freeMicro > config('membership.free_daily_micro_limit'),
                503, 'Free AI is at capacity. Your tokens remain available; please try again later.');
            DB::table('vibes_spend_days')->where('day', $day)->increment('free_held', $freeMicro);
            abort_if($budget->spent + $budget->held + $micro > config('vibes.daily_micro_usd_limit'), 503, 'AI is at capacity. Please try again later.');
            DB::table('vibes_spend_days')->where('day', $day)->increment('held', $micro);
            DB::table('vibes_turns')->insert([
                'id' => $id, 'user_id' => $userId, 'chat_id' => $chat->id, 'digest' => $digest,
                'model' => $q['model'], 'status' => 'queued', 'request' => json_encode($q['request']),
                'allocations' => json_encode($allocations), 'prompt' => $q['text'], 'reserved' => $q['max'], 'unit_scale' => $scale, 'free_reserved_micro' => $freeMicro,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            // The quote's attachments now belong to this turn, which is the only thing the
            // job will expand and the only way one can be seen in this turn's transcript.
            // Linked under the wallet lock, so two sends cannot both claim one photo.
            $attached = $q['attachments'] ?? [];
            if ($attached) {
                $linked = DB::table('vibes_attachments')->where('user_id', $userId)->whereIn('id', $attached)
                    ->whereNull('turn_id')->update(['turn_id' => $id, 'updated_at' => now()]);
                abort_unless($linked === count($attached), 409, 'An attachment was already sent. Attach it again.');
            }
            DB::table('vibes_chats')->where('id', $chat->id)->increment('revision');
            $this->wallet->record($userId, 'hold:'.$id, 'hold', -$q['max']);
            app(\App\Services\Progress\WorkEvents::class)->observe($id);
            app(\App\Services\Decisions\ShadowRouting::class)->submitted($userId, $q);
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
    public function settle(string $id, ?int $micro, ?string $response, ?string $error = null, bool $uncertain = false, bool $absorb = false, ?string $finishReason = null): void
    {
        $original = DB::table('vibes_turns')->where('id', $id)->firstOrFail();
        DB::transaction(function () use ($original, $micro, $response, $error, $uncertain, $absorb, $finishReason) {
            $this->wallet->lock($original->user_id);
            $t = DB::table('vibes_turns')->where('id', $original->id)->firstOrFail();
            if ($t->settled_at) return;
            app(\App\Services\Membership\Allowances::class)->expire($t->user_id);
            $microPerUnit = \App\Services\Membership\Units::microPerUnit($t);
            $charge = $absorb ? 0 : min($t->reserved, max(0, (int) ceil(($micro ?? 0) / $microPerUnit)));
            $left = $charge; $trialUsed = 0; $returned = 0;
            foreach (json_decode($t->allocations, true) as $a) {
                $used = min($left, $a['amount']); $left -= $used;
                if ($a['trial']) $trialUsed += $used;
                $released = $a['amount'] - $used;
                $changed = DB::table('vibes_grants')->where('id', $a['id'])->whereNull('revoked_at')->increment('remaining', $released);
                if ($changed) $returned += $released;
            }
            $chat = DB::table('vibes_chats')->where('id', $t->chat_id);
            if (($t->unit_scale ?? 1) === 1) $chat->increment('trial_used', $trialUsed);
            // A failed first response does not use up an otherwise empty trial conversation.
            if (!$response && !$charge && !DB::table('vibes_turns')->where('chat_id', $t->chat_id)->whereNotNull('response')->exists()) {
                $chat->update(['trial_slot' => null]);
            }
            DB::table('vibes_turns')->where('id', $t->id)->update([
                'status' => $t->cancel_requested ? 'cancelled' : ($error ? 'failed' : 'completed'),
                'finish_reason' => $t->cancel_requested ? 'cancelled' : ($finishReason ?? ($error ? 'provider_error' : 'response_ready')),
                'response' => $response, 'error' => $error, 'charged' => $charge,
                'actual_micro_usd' => $micro ?? 0, 'settled_at' => now(), 'updated_at' => now(),
            ]);
            app(\App\Services\Progress\WorkEvents::class)->observe($t->id);
            $day = substr($t->created_at, 0, 10);
            DB::table('vibes_spend_days')->where('day', $day)->decrement('held', $t->reserved * $microPerUnit);
            $risk = $uncertain ? max($micro ?? 0, $t->reserved * $microPerUnit) : ($micro ?? $t->reserved * $microPerUnit);
            DB::table('vibes_spend_days')->where('day', $day)->increment('spent', $risk);
            $freeHeld = (int) ($t->free_reserved_micro ?? 0);
            DB::table('vibes_spend_days')->where('day', $day)->decrement('free_held', $freeHeld);
            $freeRisk = $t->reserved > 0 ? (int) ceil($risk * $freeHeld / ($t->reserved * $microPerUnit)) : 0;
            DB::table('vibes_spend_days')->where('day', $day)->increment('free_spent', $freeRisk);
            $this->wallet->record($t->user_id, 'settle:'.$t->id, 'settlement', $returned,
                ['expiredOrRevokedUnits' => $t->reserved - $charge - $returned, 'charged' => $charge, 'actualMicroUsd' => $micro, 'unconfirmedMicroUsd' => $risk - ($micro ?? 0),
                    'absorbedMicroUsd' => max(0, ($micro ?? 0) - $charge * $microPerUnit)]);
        }, 5);
    }

    public function payload(object $t): array
    {
        return ['id' => $t->id, 'chatId' => $t->chat_id, 'model' => $t->model, 'status' => $t->status,
            'finishReason' => $t->finish_reason ?? null,
            'progress' => app(\App\Services\Progress\WorkEvents::class)->payload((int) $t->user_id, $t->id),
            'prompt' => $t->prompt, 'response' => $t->response, 'error' => $t->error,
            'tools' => app(AgentTools::class)->payload($t->id),
            'attachments' => DB::table('vibes_attachments')->where('turn_id', $t->id)->orderBy('created_at')->get()
                ->map(fn ($a) => app(Attachments::class)->payload($a))->all(),
            // What this reply saved to or removed from the person's memory, for the line under it.
            'memory' => isset($t->memory) ? json_decode($t->memory, true) : null,
            'unitScale' => $t->unit_scale ?? 1, 'reservedUnits' => (string) $t->reserved, 'chargedUnits' => (string) $t->charged,
            'reserved' => $t->reserved / ($t->unit_scale ?? 1), 'charged' => $t->charged / ($t->unit_scale ?? 1), 'createdAt' => $t->created_at];
    }
}
