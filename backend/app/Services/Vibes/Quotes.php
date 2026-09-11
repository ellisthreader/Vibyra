<?php

namespace App\Services\Vibes;

use App\Services\Integrations\IntegrationTools;
use App\Services\Vibes\Auto\Router;
use App\Services\Vibes\Auto\Situation;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class Quotes
{
    public function __construct(
        private readonly Catalog $catalog,
        private readonly Wallet $wallet,
        private readonly Router $router,
        private readonly IntegrationTools $integrations,
    ) {}

    /** The level to price and send: what was asked for, if this model takes it. */
    private function effort(array $selected, ?string $wanted): ?string
    {
        $available = $selected['efforts'];
        if (! $available) return null;
        if ($wanted !== null && in_array($wanted, $available, true)) return $wanted;
        // A level this model never offered is not an error the person can act on;
        // the provider's own default is used and the quote reports what it priced.
        return $selected['defaultEffort'] ?? null;
    }

    /**
     * `$integrations` are the connectors the person named in this message. They are
     * resolved against what the account has really connected before anything is
     * priced, because their schemas travel with the prompt and are paid for.
     */
    public function create(int $userId, string $chatId, string $text, string $model, ?string $effort = null, array $integrations = []): array
    {
        $chat = DB::table('vibes_chats')->where('id', $chatId)->where('user_id', $userId)->firstOrFail();
        $named = $this->integrations->resolve($userId, $integrations);
        // The conversation is assembled before the model is chosen, because nothing in
        // it depends on the model and Auto has to know how big this turn is to route
        // it. It also means the bound-project system prompt is priced, which the
        // previous order missed by rewriting it after the bound had been taken.
        $messages = $this->messages($chatId, $text, (bool) $chat->binding, $named);
        // Assembled before the price so the schemas are inside the bound, and before
        // the router so it weighs the turn that will actually be sent.
        $tools = [...($chat->binding ? AgentTools::definitions() : []), ...$this->integrations->definitions($named)];
        $inputBound = TurnPrice::inputBound($messages, $tools);
        $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->get();
        $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
        $trialUsable = $chat->trial_slot || ! $paid
            ? min(max(0, Wallet::trialChatCredits() - $chat->trial_used), (int) $grants->where('kind', 'trial')->sum('remaining')) : 0;

        $decision = $model === 'auto'
            // Integrations need a tool-calling model just as a bound project does, so Auto
            // is told tools are in play rather than being left to pick one that cannot.
            ? $this->router->route($text, Situation::of($inputBound, $paid + $trialUsable, $paid === 0,
                (bool) $chat->binding || $named !== [], $this->historyBytes($messages), intdiv(max(0, count($messages) - 2), 2)))
            : null;

        $selected = $this->catalog->resolve($decision?->model ?? $model, $this->wallet->planFor($userId));
        // Under Auto the router owns the level too. Honouring a level the client sent
        // alongside "choose for me" is how an invisible, unchangeable effort ends up
        // priced into someone's turn, since the composer hides the control for Auto.
        $effort = $this->effort($selected, $decision !== null ? $decision->effort : $effort);

        $p = $selected['pricing'];
        $output = TurnPrice::outputTokens($effort);
        $max = TurnPrice::credits($inputBound, $effort, $p);
        abort_if($max > TurnPrice::CEILING, 422, $effort && TurnPrice::scale($effort) > 1.0
            ? 'This turn is too expensive at '.$effort.' effort. Lower the effort, start a shorter chat or choose an economical model.'
            : 'This context is too expensive for one turn. Start a shorter chat or choose an economical model.');

        // Usage accounting is opt-in at OpenRouter, and `usage.cost` is the single
        // figure this whole economy settles on: `RunVibesTurn` charges from it and
        // parks the turn as `reconciling` without it, so a reply only reached the
        // person once the minutely recovery command had fetched the cost separately.
        // Asking for it here is what makes a turn settle in the same response that
        // produced it. Kept beside `max_tokens` because the request is replayed
        // verbatim, so anything the settlement needs has to live in it.
        $request = ['model' => $selected['id'], 'messages' => $messages, 'max_tokens' => $output,
            'usage' => ['include' => true],
            'provider' => ['require_parameters' => true, 'allow_fallbacks' => false,
                'max_price' => ['prompt' => (float) $p['prompt'] * 1000000, 'completion' => (float) $p['completion'] * 1000000]]];
        // Priced above and sent here, so the turn that runs is the turn quoted.
        if ($effort !== null) $request['reasoning'] = ['effort' => $effort];
        if ($tools) {
            abort_unless($selected['tools'], 422, $chat->binding
                ? 'This model does not currently support project tools. Choose another model.'
                : 'This model cannot use integrations. Choose another model, or send the message without the mention.');
            // A tool turn runs several model steps, so it reserves the room to finish
            // rather than the price of its first step. Unused credit is returned at settle.
            $trial = $selected['trial'] ? $trialUsable : 0;
            $max = max(1, min(TurnPrice::CEILING, $trial + $paid));
            $request['tools'] = $tools;
        }
        $data = ['userId' => $userId, 'chatId' => $chatId, 'text' => $text, 'model' => $selected['id'],
            'trial' => $selected['trial'], 'max' => $max, 'request' => $request,
            'expires' => now()->addMinutes(2)->timestamp, 'revision' => $chat->revision];

        return ['quote' => Crypt::encryptString(json_encode($data, JSON_THROW_ON_ERROR)),
            'maxCredits' => $max, 'estimatedCredits' => $max,
            // The effort priced, which is not always the effort asked for.
            'model' => $selected['id'], 'effort' => $effort, 'expiresAt' => $data['expires'],
            // The integrations actually attached, which is not always the ones asked for.
            'integrations' => $named,
            // Present only for Auto, so the composer can say what it chose and why.
            'auto' => $decision === null ? null : ['reason' => $decision->reason, 'name' => $selected['name']]];
    }

    /**
     * The conversation as the provider will receive it, trimmed oldest-first to the
     * context budget. The two system prompts differ in length as well as in content,
     * so which one is used has to be settled before the turn is priced.
     */
    private function messages(string $chatId, string $text, bool $bound, array $integrations = []): array
    {
        $history = DB::table('vibes_turns')->where('chat_id', $chatId)->whereNotNull('settled_at')
            ->whereNotNull('response')->orderByDesc('created_at')->limit(12)->get()->reverse();
        $messages = [['role' => 'system', 'content' => $this->prompt($bound, $integrations)]];
        foreach ($history as $turn) {
            $messages[] = ['role' => 'user', 'content' => $turn->prompt];
            $messages[] = ['role' => 'assistant', 'content' => $turn->response];
        }
        $messages[] = ['role' => 'user', 'content' => $text];
        while (strlen((string) json_encode($messages)) > 20000 && count($messages) > 2) array_splice($messages, 1, 2);

        return $messages;
    }

    /**
     * Naming the integrations rather than leaving the model to infer them from the tool
     * list is what stops it answering from memory when a call fails: it is told the
     * account is real and that an empty result is an answer, not a prompt to guess.
     */
    private function prompt(bool $bound, array $integrations): string
    {
        $base = $bound ? self::AGENT_PROMPT : self::CHAT_PROMPT;
        if (! $integrations) return $base;
        $names = implode(', ', array_map(fn ($slug) => (string) config('integrations.catalogue.'.$slug.'.name', $slug), $integrations));

        return $base.' The person has connected '.$names.' and referred to it in this message. '
            .'Use its tools to answer from their own account rather than from memory. '
            .'Report an error or an empty result plainly, and never state a figure, message or record a tool did not return.';
    }

    /** What the turn carries besides its own prompt, which is what Auto reads as breadth. */
    private function historyBytes(array $messages): int
    {
        return count($messages) > 2 ? strlen((string) json_encode(array_slice($messages, 1, -1))) : 0;
    }

    private const CHAT_PROMPT = 'You are Vibyra, a helpful coding assistant. Be concise and practical. '
        .'You have no computer tools in this conversation. Never claim to have edited files or run commands.';

    private const AGENT_PROMPT = 'You are Vibyra, a careful coding agent. Use the authorized project tools to inspect and edit files. '
        .'Only claim file effects confirmed by tool results. You cannot execute commands or tests. Never invent test results. '
        .'Respect declined operations. Keep changes focused, read before editing, and never request secrets or dependency folders. '
        .'You have at most four model steps and a bounded budget. Finish with a useful partial result if needed.';

    public function decode(string $quote, int $userId): array
    {
        try { $q = json_decode(Crypt::decryptString($quote), true, flags: JSON_THROW_ON_ERROR); }
        catch (\Throwable) { abort(422, 'The estimate is invalid. Please refresh it.'); }
        abort_unless(($q['userId'] ?? null) === $userId, 403);
        return $q;
    }
}
