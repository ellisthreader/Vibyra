<?php
namespace App\Services\Decisions;
use App\Jobs\ClassifyDecision;
use App\Services\Vibes\Quotes;
use Illuminate\Support\Facades\{Crypt, DB};
final class Preparations
{
    public static function enabled(int $user, bool $agent): bool
    {
        return config('intelligence.jev_mode') === 'active'
            && config($agent ? 'intelligence.auto_teammate' : 'intelligence.auto_work')
            && (bool) DB::table('notification_preferences')->where('user_id', $user)->value('smart');
    }
    public function start(int $user, string $id, string $quote): array
    {
        $q = app(Quotes::class)->decode($quote, $user);
        abort_unless(($q['selection'] ?? null) === 'auto', 422, 'Only Auto requests can be prepared.');
        abort_unless(self::enabled($user, isset($q['request']['vibyraAgent'])), 409, 'Smart Auto is unavailable. Refresh the estimate.');
        abort_unless(DB::table('vibes_wallets')->where('user_id', $user)->value('consented_at'), 403, 'Allow AI processing first.');
        abort_if($q['expires'] <= now()->timestamp, 409, 'Refresh the estimate.');
        $fingerprint = hash('sha256', $quote);
        DB::transaction(function () use ($user, $id, $q, $fingerprint) {
            DB::table('users')->where('id', $user)->lockForUpdate()->firstOrFail();
            $old = DB::table('ai_decisions')->where('id', $id)->first();
            if ($old) { abort_unless($old->user_id === $user && hash_equals($old->fingerprint, $fingerprint), 409, 'Preparation identity changed.'); return; }
            $this->freshQuote($user, $q);
            abort_if(DB::table('ai_decisions')->where('user_id', $user)->where('created_at', '>', now()->subMinute())->count() >= 12, 429, 'Please wait before trying again.');
            $state = ['request' => \App\Services\Vibes\Auto\RoutingPrompt::from($q['text'], $q['request']['messages'])];
            if (isset($q['request']['vibyraAgent'])) {
                $chat = DB::table('vibes_chats')->where('id', $q['chatId'])->where('user_id', $user)->firstOrFail();
                $state['job'] = mb_substr((string) DB::table('agent_teammates')->where('id', $chat->agent_id)->value('brief'), 0, 4000);
            }
            DB::table('ai_decisions')->insert(['id' => $id, 'user_id' => $user, 'purpose' => 'routing', 'fingerprint' => $fingerprint,
                'input' => Crypt::encryptString(json_encode(['quote' => $q, 'state' => $state])),
                'deadline' => now()->addSeconds(2), 'created_at' => now(), 'updated_at' => now()]);
            ClassifyDecision::dispatch($id)->afterCommit();
        });
        return ['id' => $id, 'state' => 'pending'];
    }
    public function status(int $user, string $id): array
    {
        $d = DB::table('ai_decisions')->where('id', $id)->where('user_id', $user)->where('purpose', 'routing')->firstOrFail();
        if ($d->state === 'ready') return ['id' => $id, 'state' => 'ready', 'quote' => json_decode(Crypt::decryptString($d->result), true)['quote']];
        if (in_array($d->state, ['pending','classifying']) && now()->lt($d->deadline)) return ['id' => $id, 'state' => 'pending'];
        abort_unless($d->input, 409, 'Preparation expired. Refresh the estimate.');
        $input = json_decode(Crypt::decryptString($d->input), true); $q = $input['quote'];
        $semantic = $d->state === 'classified' && self::enabled($user, isset($q['request']['vibyraAgent']))
            ? json_decode(Crypt::decryptString($d->result), true) : null;
        $final = $this->freshQuote($user, $q, $semantic);
        // Quote generation does no network work; compare-and-set freezes the first completed result.
        $saved = DB::table('ai_decisions')->where('id', $id)->where('state', $d->state)->update([
            'state' => 'ready', 'input' => null, 'result' => Crypt::encryptString(json_encode(['quote' => $final, 'decision' => $semantic])),
            'reason' => $semantic ? null : 'local_fallback', 'updated_at' => now()]);
        return $saved ? ['id' => $id, 'state' => 'ready', 'quote' => $final] : $this->status($user, $id);
    }
    /** Validate freshness before admission and again when freezing the accepted quote. */
    public function freshQuote(int $user, array $q, ?array $semantic = null): array
    {
        abort_unless(DB::table('vibes_chats')->where('id', $q['chatId'])->where('user_id', $user)->value('revision') === $q['revision'], 409, 'The conversation changed. Refresh the estimate.');
        $final = app(Quotes::class)->create($user, $q['chatId'], $q['text'], 'auto', null, $q['integrations'] ?? [], $q['attachments'], $semantic);
        $fresh = app(Quotes::class)->decode($final['quote'], $user);
        foreach (['messages','tools','vibyraAgent'] as $key) abort_unless(($q['request'][$key] ?? null) === ($fresh['request'][$key] ?? null), 409, 'Task context changed. Refresh the estimate.');
        return $final;
    }

}
