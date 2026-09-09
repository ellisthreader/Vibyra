<?php

namespace App\Services\Vibes;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class Quotes
{
    public function __construct(private readonly Catalog $catalog, private readonly Wallet $wallet) {}

    public function create(int $userId, string $chatId, string $text, string $model): array
    {
        $chat = DB::table('vibes_chats')->where('id', $chatId)->where('user_id', $userId)->firstOrFail();
        $selected = $this->catalog->resolve($model, $this->wallet->planFor($userId));
        $history = DB::table('vibes_turns')->where('chat_id', $chatId)->whereNotNull('settled_at')
            ->whereNotNull('response')->orderByDesc('created_at')->limit(12)->get()->reverse();
        $messages = [['role' => 'system', 'content' => 'You are Vibyra, a helpful coding assistant. Be concise and practical. '
            .'You have no computer tools in this conversation. Never claim to have edited files or run commands.']];
        foreach ($history as $turn) {
            $messages[] = ['role' => 'user', 'content' => $turn->prompt];
            $messages[] = ['role' => 'assistant', 'content' => $turn->response];
        }
        $messages[] = ['role' => 'user', 'content' => $text];
        while (strlen(json_encode($messages)) > 20000 && count($messages) > 2) array_splice($messages, 1, 2);
        $inputBound = strlen(json_encode($messages)) + count($messages) * 64;
        $output = (int) config('vibes.max_output_tokens');
        $p = $selected['pricing'];
        // Conservative byte bound; no assumption that one token always equals four characters.
        $usd = ($inputBound * max((float) $p['prompt'], (float) ($p['input_cache_write'] ?? 0))
            + $output * (float) $p['completion']) * 1.1;
        $max = max(1, (int) ceil($usd * 100));
        abort_if($max > 50, 422, 'This context is too expensive for one turn. Start a shorter chat or choose an economical model.');
        $request = ['model' => $selected['id'], 'messages' => $messages, 'max_tokens' => $output,
            'provider' => ['require_parameters' => true, 'allow_fallbacks' => false,
                'max_price' => ['prompt' => (float) $p['prompt'] * 1000000, 'completion' => (float) $p['completion'] * 1000000]]];
        if ($chat->binding) {
            abort_unless($selected['tools'], 422, 'This model does not currently support project tools. Choose another model.');
            $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->get();
            $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
            $trial = $selected['trial'] && ($chat->trial_slot || !$paid)
                ? min(max(0, 50 - $chat->trial_used), (int) $grants->where('kind', 'trial')->sum('remaining')) : 0;
            $max = max(1, min(50, $trial + $paid));
            $request['tools'] = AgentTools::definitions();
            $request['messages'][0]['content'] = 'You are Vibyra, a careful coding agent. Use the authorized project tools to inspect and edit files. '
                .'Only claim file effects confirmed by tool results. You cannot execute commands or tests. Never invent test results. '
                .'Respect declined operations. Keep changes focused, read before editing, and never request secrets or dependency folders. '
                .'You have at most four model steps and a bounded budget. Finish with a useful partial result if needed.';
        }
        $data = ['userId' => $userId, 'chatId' => $chatId, 'text' => $text, 'model' => $selected['id'],
            'trial' => $selected['trial'], 'max' => $max, 'request' => $request,
            'expires' => now()->addMinutes(2)->timestamp, 'revision' => $chat->revision];
        return ['quote' => Crypt::encryptString(json_encode($data, JSON_THROW_ON_ERROR)),
            'maxCredits' => $max, 'estimatedCredits' => $max,
            'model' => $selected['id'], 'expiresAt' => $data['expires']];
    }

    public function decode(string $quote, int $userId): array
    {
        try { $q = json_decode(Crypt::decryptString($quote), true, flags: JSON_THROW_ON_ERROR); }
        catch (\Throwable) { abort(422, 'The estimate is invalid. Please refresh it.'); }
        abort_unless(($q['userId'] ?? null) === $userId, 403);
        return $q;
    }
}
