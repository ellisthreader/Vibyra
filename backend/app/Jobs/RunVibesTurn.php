<?php

namespace App\Jobs;

use App\Services\ChatConnectors\ConnectorRunner;
use App\Services\Vibes\{AgentTools, Attachments, ChatMemory, TurnPrice, Turns};
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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
        // A stop is the person's doing; a disabled feature or a missing key is ours.
        // Both settled as "stopped", which is how a server with no OpenRouter key
        // came to look, in every chat, like a request the person had cancelled.
        if ($t->cancel_requested || !config('vibes.enabled') || !config('services.openrouter.key')) {
            $ours = ! $t->cancel_requested;
            if ($ours) Log::error('vibes.turn.unconfigured', ['turn' => $t->id,
                'enabled' => (bool) config('vibes.enabled'), 'key' => (bool) config('services.openrouter.key')]);
            $turns->settle($t->id, $t->actual_micro_usd, null, $ours
                ? 'Vibyra cannot reach the AI right now. You were not charged, and we have been alerted.'
                : 'This request was stopped. Only confirmed usage was charged.');
            return;
        }
        try {
            $request = json_decode($t->request, true);
            $meta = $request['vibyraAgent'] ?? null;
            if ($meta) {
                try { \App\Services\Agents\TaskContext::validate($t->user_id, $meta); }
                catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
                    $turns->settle($t->id, $t->actual_micro_usd, null, $e->getMessage());
                    return;
                }
            }
            $maxSteps = $meta ? min(12, max(1, (int) ($meta['maxSteps'] ?? 8))) : 4;
            // The stored request carries references; the provider is sent the photos and
            // files themselves, and only those linked to this turn.
            [$outgoing, $attached] = app(Attachments::class)->expand($request, $t->id);
            unset($outgoing['vibyraAgent']);
            $prices = $request['provider']['max_price'] ?? [];
            // Bounded with the very method `Quotes` priced this turn by, so the budget
            // the job enforces and the budget the person was quoted are one number
            // rather than two that drift apart the first time either is tuned.
            $inputCost = (TurnPrice::inputBound($request['messages'] ?? [], $request['tools'] ?? []) + $attached)
                * ($prices['prompt'] ?? 100);
            $completionRate = max(0.001, (float) ($prices['completion'] ?? 100));
            $remainingMicro = $t->reserved * 10000 - $t->actual_micro_usd;
            $outputTokens = min($request['max_tokens'] ?? 2048, (int) floor(($remainingMicro / 1.1 - $inputCost) / $completionRate));
            if ($t->step_count >= $maxSteps || $outputTokens < 128 || $t->cancel_requested) {
                $turns->settle($t->id, $t->actual_micro_usd, 'Paused at the turn budget. Review the tool results for any completed changes. Send another message to continue.');
                return;
            }
            $outgoing['max_tokens'] = $outputTokens;
            // The last priced model step must turn collected evidence into an answer.
            if ($t->step_count === $maxSteps - 1) unset($outgoing['tools'], $outgoing['tool_choice']);
            DB::table('vibes_turns')->where('id', $t->id)->increment('step_count');
            $response = Http::withToken(config('services.openrouter.key'))->acceptJson()->timeout(65)
                ->withHeaders(['HTTP-Referer' => 'https://vibyra.app', 'X-OpenRouter-Title' => 'Vibyra'])
                ->post(config('services.openrouter.url'), $outgoing);
            $body = $response->json();
            $id = is_string($body['id'] ?? null) ? $body['id'] : null;
            DB::table('vibes_turns')->where('id', $t->id)->update(['generation_id' => $id]);
            $cost = $body['usage']['cost'] ?? null;
            $text = $body['choices'][0]['message']['content'] ?? null;
            $text = is_string($text) && trim($text) !== '' ? $text : null;
            // Memory lines are for this server, not the person: taken out of every reply,
            // and carried out only when this turn may change memory (see `ChatMemory`).
            if ($text !== null && $response->successful()) $text = app(ChatMemory::class)->settle($t, $request, $text) ?: null;
            if (is_numeric($cost) && is_finite((float) $cost) && (float) $cost >= 0) {
                $micro = (int) ceil((float) $cost * 1000000);
                $fresh = DB::table('vibes_turns')->where('id', $t->id)->firstOrFail();
                if ($response->successful() && !empty($body['choices'][0]['message']['tool_calls']) && !$fresh->cancel_requested) {
                    try {
                        app(AgentTools::class)->awaitTools($t, $body['choices'][0]['message'], $micro);
                    } catch (\Symfony\Component\HttpKernel\Exception\HttpException | \JsonException $e) {
                        // Validation rolls back the entire batch before any tool runs.
                        // Usage is known: this is not an uncertain-cost reconciliation.
                        $turns->settle($t->id, $t->actual_micro_usd + $micro, null,
                            'The AI requested an invalid tool action. No tools from that request ran. Please try again. You were not charged.', absorb: true);
                        return;
                    }
                    // Integration calls are answered here rather than by the phone, which also
                    // re-queues this turn; a call the phone owes still parks as before.
                    app(ConnectorRunner::class)->run($t->id, (int) $t->user_id);
                    return;
                }
                // A call that succeeded but came back empty is a budgeting failure on
                // our side, most often reasoning consuming the whole output envelope.
                // The person receives nothing, so the person pays nothing.
                $empty = $response->successful() && ! $text;
                $error = $empty ? 'The AI thought for too long and ran out of room to answer. You were not charged. Try a lower effort.'
                    : (! $response->successful() ? $this->refusal($response->status(), $body, $t->id, $id, false) : null);
                $turns->settle($t->id, $t->actual_micro_usd + $micro, $text, $error, absorb: $empty);
            } elseif (in_array($response->status(), [400, 401, 402, 403, 404, 422, 429])) {
                $turns->settle($t->id, $t->actual_micro_usd, null, $this->refusal($response->status(), $body, $t->id, $id, true));
            } else {
                // Parked rather than settled: a 5xx may have run and cost money, which
                // the recovery command reconciles from the generation id. Logged because
                // parking silently left nothing to read for a turn that never came back.
                Log::warning('vibes.turn.parked', ['turn' => $t->id, 'generation' => $id,
                    'status' => $response->status(), 'cost' => $cost]);
                DB::table('vibes_turns')->where('id', $t->id)->update(['status' => 'reconciling', 'response' => $text]);
            }
        } catch (Throwable $e) {
            // Swallowed entirely before this, so a turn that threw produced no reply,
            // no error and no log line - the failure this server could say least about.
            Log::error('vibes.turn.threw', ['turn' => $this->turnId,
                'exception' => $e::class, 'message' => $e->getMessage()]);
            DB::table('vibes_turns')->where('id', $t->id)->whereNull('settled_at')->update(['status' => 'reconciling']);
        }
    }

    /**
     * What the person reads when the provider refused the turn, and what this server
     * records so the refusal can be told apart afterwards. Every one of these was
     * "The AI provider is unavailable", which reads identically whether the key is
     * wrong, the OpenRouter balance ran out, one model was retired or the request
     * was merely rate-limited - four different jobs for whoever is on call, and
     * nothing in the chat or the log to say which had happened.
     */
    private function refusal(int $status, mixed $body, string $turnId, ?string $generationId, bool $refunded): string
    {
        $detail = is_array($body) && is_array($body['error'] ?? null) ? $body['error'] : [];
        Log::warning('vibes.turn.refused', ['turn' => $turnId, 'generation' => $generationId,
            'status' => $status, 'code' => $detail['code'] ?? null,
            'provider' => $detail['metadata']['provider_name'] ?? null,
            'reason' => is_string($detail['message'] ?? null) ? $detail['message'] : null]);
        $tail = $refunded ? ' Unused Vibes were returned.' : '';

        return match ($status) {
            // Ours to fix. The person can do nothing about either, so neither asks them to.
            401 => 'Vibyra cannot reach the AI right now. We have been alerted.'.$tail,
            402 => 'Vibyra has run out of AI credit. We have been alerted.'.$tail,
            // Theirs to act on, and each says what acting looks like.
            403 => 'The AI declined this message. Try rewording it.'.$tail,
            404 => 'That model is no longer available. Choose another one in the picker.'.$tail,
            429 => 'The AI is busy right now. Try again in a moment.'.$tail,
            400, 422 => 'This message could not be sent to the AI.'.$tail,
            default => 'The AI could not finish this reply.'.$tail,
        };
    }
}
