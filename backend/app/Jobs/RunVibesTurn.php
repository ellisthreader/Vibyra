<?php

namespace App\Jobs;

use App\Services\Integrations\IntegrationRunner;
use App\Services\Vibes\{AgentTools, TurnPrice, Turns};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Throwable;

class RunVibesTurn implements ShouldQueue
{
    use Queueable;
    public int $tries = 1;
    public int $timeout = 80;

    public function __construct(public string $turnId)
    {
        $this->onConnection(config('vibes.queue_connection'))->onQueue('vibes');
    }

    public function handle(Turns $turns): void
    {
        // A duplicate job must never repeat an ambiguous provider request.
        $claimed = DB::table('vibes_turns')->where('id', $this->turnId)->where('status', 'queued')
            ->whereNull('settled_at')->update(['status' => 'running', 'dispatched_at' => now(), 'updated_at' => now()]);
        if (!$claimed) return;
        $t = DB::table('vibes_turns')->where('id', $this->turnId)->firstOrFail();
        if ($t->cancel_requested || !config('vibes.enabled') || !config('services.openrouter.key')) {
            $turns->settle($t->id, $t->actual_micro_usd, null, 'This request was stopped. Only confirmed usage was charged.');
            return;
        }
        try {
            $request = json_decode($t->request, true);
            $prices = $request['provider']['max_price'] ?? [];
            // Bounded with the very method `Quotes` priced this turn by, so the budget
            // the job enforces and the budget the person was quoted are one number
            // rather than two that drift apart the first time either is tuned.
            $inputCost = TurnPrice::inputBound($request['messages'] ?? [], $request['tools'] ?? [])
                * ($prices['prompt'] ?? 100);
            $completionRate = max(0.001, (float) ($prices['completion'] ?? 100));
            $remainingMicro = $t->reserved * 10000 - $t->actual_micro_usd;
            $outputTokens = min($request['max_tokens'] ?? 2048, (int) floor(($remainingMicro / 1.1 - $inputCost) / $completionRate));
            if ($t->step_count >= 4 || $outputTokens < 128 || $t->cancel_requested) {
                $turns->settle($t->id, $t->actual_micro_usd, 'Paused at the turn budget. Review the tool results for any completed changes. Send another message to continue.');
                return;
            }
            $request['max_tokens'] = $outputTokens;
            DB::table('vibes_turns')->where('id', $t->id)->increment('step_count');
            $response = Http::withToken(config('services.openrouter.key'))->acceptJson()->timeout(65)
                ->withHeaders(['HTTP-Referer' => 'https://vibyra.app', 'X-OpenRouter-Title' => 'Vibyra'])
                ->post(config('services.openrouter.url'), $request);
            $body = $response->json();
            $id = is_string($body['id'] ?? null) ? $body['id'] : null;
            DB::table('vibes_turns')->where('id', $t->id)->update(['generation_id' => $id]);
            $cost = $body['usage']['cost'] ?? null;
            $text = $body['choices'][0]['message']['content'] ?? null;
            $text = is_string($text) && trim($text) !== '' ? $text : null;
            if (is_numeric($cost) && is_finite((float) $cost) && (float) $cost >= 0) {
                $micro = (int) ceil((float) $cost * 1000000);
                $fresh = DB::table('vibes_turns')->where('id', $t->id)->firstOrFail();
                if ($response->successful() && !empty($body['choices'][0]['message']['tool_calls']) && !$fresh->cancel_requested) {
                    app(AgentTools::class)->awaitTools($t, $body['choices'][0]['message'], $micro);
                    // Integration calls are answered here rather than by the phone, which also
                    // re-queues this turn; a call the phone owes still parks as before.
                    app(IntegrationRunner::class)->run($t->id, (int) $t->user_id);
                    return;
                }
                // A call that succeeded but came back empty is a budgeting failure on
                // our side, most often reasoning consuming the whole output envelope.
                // The person receives nothing, so the person pays nothing.
                $empty = $response->successful() && ! $text;
                $error = $empty ? 'The AI thought for too long and ran out of room to answer. You were not charged. Try a lower effort.'
                    : (! $response->successful() ? 'The AI could not finish this reply.' : null);
                $turns->settle($t->id, $t->actual_micro_usd + $micro, $text, $error, absorb: $empty);
            } elseif (in_array($response->status(), [400, 401, 402, 403, 404, 422, 429])) {
                $turns->settle($t->id, $t->actual_micro_usd, null, 'The AI provider is unavailable. Unused Vibes were returned.');
            } else {
                DB::table('vibes_turns')->where('id', $t->id)->update(['status' => 'reconciling', 'response' => $text]);
            }
        } catch (Throwable) {
            DB::table('vibes_turns')->where('id', $t->id)->whereNull('settled_at')->update(['status' => 'reconciling']);
        }
    }
}
