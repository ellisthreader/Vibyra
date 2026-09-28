<?php
namespace App\Services\Vibes;

use App\Services\ChatConnectors\ConnectorTools;
use App\Services\Vibes\Auto\{Router, RoutingPrompt, Situation};
use App\Services\Agents\ModelRouter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

class Quotes {
    public const MAX_ENCODED_LENGTH = 262144;
    public function __construct(
        private readonly Catalog $catalog,
        private readonly Wallet $wallet,
        private readonly Router $router,
        private readonly ConnectorTools $integrations,
        private readonly PersonalPrompt $personal,
        private readonly Attachments $attachments,
        private readonly ModelRouter $agentRouter,
    ) {}

    private function effort(array $selected, ?string $wanted): ?string
    {
        $available = $selected['efforts'];
        if (! $available) return null;
        if ($wanted !== null && in_array($wanted, $available, true)) return $wanted;
        return $selected['defaultEffort'] ?? null;
    }

    public function create(int $userId, string $chatId, string $text, string $model, ?string $effort = null, array $integrations = [], array $attachments = [], ?array $semantic = null): array
    {
        app(\App\Services\Membership\Allowances::class)->refresh($userId);
        $scale = \App\Services\Membership\Units::scale($userId);
        $chat = DB::table('vibes_chats')->where('id', $chatId)->where('user_id', $userId)->firstOrFail();
        $terminal = ($chat->terminal_model ?? null) !== null;
        app(FundedTerminals::class)->guard($userId, $chat, $model);
        if ($terminal) {
            app(TerminalCatalog::class)->resolve($model);
            abort_if($integrations !== [], 422, 'Use project tools in this terminal. Connected app actions belong in AI chat.');
        }
        if ($terminal) $effort = $chat->terminal_effort ?? $effort;
        $bound = (bool) $chat->binding && (! $terminal || $chat->terminal_tools);
        $agent = \App\Services\Agents\TaskContext::forChat($chat);
        $computer = $agent ? app(\App\Services\Agents\Workspaces::class)->forAgent($agent) : null;
        if ($agent) {
            $integrations = \App\Services\Agents\ConnectorSelection::forTask($text,
                (array) json_decode($agent->integrations, true),
                (int) config('chat_connectors.max_per_turn', 10));
            if ($model === 'auto') $model = $agent->model ?? 'auto';
        }
        $named = $this->integrations->resolve($userId, $integrations);
        // Photos and files uploaded for this message. They ride in it as references and
        // are priced here from the bound fixed at upload, exactly as the job budgets them.
        $files = $this->attachments->forMessage($userId, $attachments);
        $seeing = $files->contains('kind', 'image');
        // Assemble before routing so history, profile and tools are all priced.
        // Tool turns cannot modify personal memory from untrusted source text.
        $personal = $agent ? \App\Services\Agents\TaskContext::prompt($agent) : $this->personal->for($userId, canSave: ! $chat->binding && $named === []);
        $messages = $this->messages($chatId, $text, $bound, $named, $personal, $files,
            $computer !== null, (bool) ($computer?->can_write ?? false),
            \App\Services\Agents\VmPlatform::allows($computer));
        // Assembled before the price so the schemas are inside the bound, and before
        // the router so it weighs the turn that will actually be sent.
        $tools = [...($bound ? AgentTools::definitions() : ($computer ? AgentTools::computerDefinitions(
            (bool) $computer->can_write, \App\Services\Agents\VmPlatform::allows($computer),
            (bool) $computer->can_write && config('agents.git_publish_enabled') && in_array('github', $named, true)) : [])),
            ...$this->integrations->definitions($named)];
        $inputBound = TurnPrice::inputBound($messages, $tools) + $this->attachments->tokens($files);
        $grants = DB::table('vibes_grants')->where('user_id', $userId)->whereNull('revoked_at')->get();
        $paid = (int) $grants->where('kind', '!=', 'trial')->sum('remaining');
        $trialUsable = $chat->trial_slot || ! $paid
            ? min(max(0, Wallet::trialChatCredits() - $chat->trial_used), (int) $grants->where('kind', 'trial')->sum('remaining')) : 0;

        if ($scale > 1) $trialUsable = (int) $grants->where('kind', 'trial')->sum('remaining');
        $paid /= $scale; $trialUsable /= $scale;
        $situation = Situation::of($inputBound, $paid + $trialUsable, $paid === 0, $tools !== [],
            $this->historyBytes($messages), intdiv(max(0, count($messages) - 2), 2), $seeing, $paid, $scale);
        $prompt = RoutingPrompt::from($text, $messages);
        $provider = $agent ? \App\Services\Agents\EngineProviders::preference($model) : null;
        $decision = $model !== 'auto' && $provider === null ? null : ($agent
            ? $this->agentRouter->route($prompt, $situation, $agent, $semantic, $provider)
            : $this->router->route($prompt, $situation, $semantic));

        $selected = $this->catalog->resolve($decision?->model ?? $model, $this->wallet->planFor($userId));
        // A model that cannot see answers a photo as if it were not there, and charges for it.
        abort_if($seeing && ! $selected['vision'], 422, $decision !== null
            ? 'No model that can see photos is available right now. Send the message without the photo, or try again later.'
            : $selected['name'].' cannot see photos. Choose Auto or a model that can.');
        // Under Auto the router owns the level too. Honouring a level the client sent
        // alongside "choose for me" is how an invisible, unchangeable effort ends up
        // priced into someone's turn, since the composer hides the control for Auto.
        $effort = $this->effort($selected, $decision !== null ? $decision->effort : $effort);

        $p = $selected['pricing'];
        $output = TurnPrice::outputTokens($effort);
        $max = TurnPrice::credits($inputBound, $effort, $p, $scale);
        abort_if(! $terminal && $max > TurnPrice::ceiling($scale), 422, $effort && TurnPrice::scale($effort) > 1.0
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
        if ($terminal) $request['modalities'] = ['text'];
        if ($effort !== null) $request['reasoning'] = ['effort' => $effort];
        // OpenRouter reads a PDF for any model, but its default parser for a model that
        // cannot read one natively is a paid OCR engine the quote never priced. Plain
        // text extraction is free and is what the page-count bound above assumes.
        if ($files->contains('kind', 'pdf')) $request['plugins'] = [['id' => 'file-parser', 'pdf' => ['engine' => 'pdf-text']]];
        if ($tools) {
            abort_unless($selected['tools'], 422, $chat->binding || $computer
                ? 'This model does not currently support project tools. Choose another model.'
                : 'This model cannot use integrations. Choose another model, or send the message without the mention.');
            // A tool turn runs several model steps, so it reserves the room to finish
            // rather than the price of its first step. Unused credit is returned at settle.
            $trial = $selected['trial'] ? $trialUsable : 0;
            $max = max(1, min(TurnPrice::ceiling($scale), $trial + $paid));
            $request['tools'] = $tools;
        }
        if ($agent) {
            $max = min($max, (int) $agent->budget);
            $request['vibyraAgent'] = \App\Services\Agents\TaskContext::metadata($agent);
        }
        if ($terminal) {
            $remaining = app(FundedTerminals::class)->remaining($chat) / 10000;
            $max = min($max, $remaining, TurnPrice::ceiling($scale));
            abort_if($remaining <= 0 || $max > $remaining, 402, 'This reply exceeds the terminal’s remaining token limit. Start a new terminal with a larger limit.');
        }
        $maxUnits = (int) ceil($max * $scale);
        $data = ['unitScale' => $scale, 'selection' => $model, 'integrations' => $named, 'userId' => $userId, 'chatId' => $chatId, 'text' => $text, 'model' => $selected['id'],
            'trial' => $selected['trial'], 'max' => $maxUnits, 'request' => $request,
            'expires' => now()->addMinutes(2)->timestamp, 'revision' => $chat->revision,
            // Linked to the turn on submit, which is what lets the job expand them.
            'attachments' => $files->pluck('id')->all()];

        $encoded = Crypt::encryptString(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        abort_if(strlen($encoded) > self::MAX_ENCODED_LENGTH, 422, 'This context is too large. Start a shorter chat or attach fewer integrations.');
        return ['quote' => $encoded,
            'smartAuto' => $model === 'auto' && \App\Services\Decisions\Preparations::enabled($userId, $agent !== null),
            'billingVersion' => $scale > 1 ? 2 : 1, 'unitScale' => $scale, 'maximumUnits' => (string) $maxUnits, 'payer' => 'vibyra_wallet',
            'maxCredits' => $maxUnits / $scale, 'estimatedCredits' => $max,
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
    private function messages(string $chatId, string $text, bool $bound, array $integrations = [], string $personal = '', ?Collection $files = null, bool $localRead = false, bool $localWrite = false, bool $localTest = false): array
    {
        $history = DB::table('vibes_turns')->where('chat_id', $chatId)->whereNotNull('settled_at')
            ->whereNotNull('response')->orderByDesc('created_at')->limit(12)->get()->reverse();
        // Earlier photos are not sent again - they are priced once, with the turn that
        // carried them - but their names stay, so "the screenshot" still means something.
        $earlier = DB::table('vibes_attachments')->whereIn('turn_id', $history->pluck('id'))->get()->groupBy('turn_id');
        $system = app(QuotePrompts::class)->text($bound, $integrations, $localRead, $localWrite, $localTest);
        // Last, after every rule. The trim below measures the conversation without it,
        // so however much the person keeps in memory, it never costs them history.
        $messages = [['role' => 'system', 'content' => $personal === '' ? $system : $system."\n\n".$personal]];
        foreach ($history as $turn) {
            $names = ($earlier[$turn->id] ?? collect())->pluck('name')->implode(', ');
            $messages[] = ['role' => 'user', 'content' => $names === '' ? $turn->prompt : $turn->prompt."\n\n[Attached with this message: ".$names.']'];
            $messages[] = ['role' => 'assistant', 'content' => $turn->response];
        }
        $messages[] = ['role' => 'user', 'content' => $this->attachments->content($text, $files ?? collect())];
        while (strlen((string) json_encode(array_slice($messages, 1))) > 20000 && count($messages) > 2) array_splice($messages, 1, 2);

        return $messages;
    }

    /** What the turn carries besides its own prompt, which is what Auto reads as breadth. */
    private function historyBytes(array $messages): int
    {
        return count($messages) > 2 ? strlen((string) json_encode(array_slice($messages, 1, -1))) : 0;
    }

    public function decode(string $quote, int $userId): array
    {
        try { $q = json_decode(Crypt::decryptString($quote), true, flags: JSON_THROW_ON_ERROR); }
        catch (\Throwable) { abort(422, 'The estimate is invalid. Please refresh it.'); }
        abort_unless(($q['userId'] ?? null) === $userId, 403);
        return $q;
    }
}
