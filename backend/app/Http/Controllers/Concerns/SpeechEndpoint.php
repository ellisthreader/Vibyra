<?php

namespace App\Http\Controllers\Concerns;

use App\Services\Billing\CreditDeductor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

/**
 * Text read aloud, billed to the account rather than to a key on one machine.
 *
 * This is the Vibyra half of spoken replies: every client — phone, web, and a
 * desktop without its own OpenAI key — asks here and gets audio back, so the
 * voice is the same product everywhere instead of whatever the operating
 * system happens to ship.
 */
trait SpeechEndpoint
{
    /** Long enough for an answer read aloud; past this, something is looping. */
    private const SPEECH_MAX_CHARS = 4000;
    private const SPEECH_PER_MINUTE = 20;

    /** The voices the API offers. A fixed list, so a request cannot reach for
     * a model or a setting by putting it in this field. */
    private const SPEECH_VOICES = [
        'alloy', 'ash', 'ballad', 'coral', 'echo',
        'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
    ];

    public function speechVoices(): JsonResponse
    {
        return $this->json([
            'ok' => true,
            'voices' => self::SPEECH_VOICES,
            'default' => $this->defaultSpeechVoice(),
        ]);
    }

    public function speech(Request $request): JsonResponse|Response
    {
        $user = $this->authenticatedUser($request);

        $key = 'speech:' . $user->id;
        if (RateLimiter::tooManyAttempts($key, self::SPEECH_PER_MINUTE)) {
            return $this->json([
                'ok' => false,
                'error' => 'That is a lot of speaking at once. Try again in a moment.',
            ], 429);
        }
        RateLimiter::hit($key, 60);

        $text = trim((string) $request->input('text', ''));
        if ($text === '') {
            return $this->json(['ok' => false, 'error' => 'Give Vibyra something to say.'], 422);
        }
        if (mb_strlen($text) > self::SPEECH_MAX_CHARS) {
            return $this->json([
                'ok' => false,
                'error' => 'That is too long to read aloud. Keep it under ' . self::SPEECH_MAX_CHARS . ' characters.',
            ], 413);
        }

        $voice = strtolower(trim((string) $request->input('voice', '')));
        if (! in_array($voice, self::SPEECH_VOICES, true)) {
            $voice = $this->defaultSpeechVoice();
        }

        $credits = $this->speechCredits($text);
        $deductor = app(CreditDeductor::class);
        $deductor->maybeResetDaily($user);
        if ((int) $user->credits_balance < $credits) {
            return $this->json([
                'ok' => false,
                'error' => 'Not enough credits left to read that aloud.',
                'creditsNeeded' => $credits,
            ], 402);
        }

        $apiKey = (string) config('services.openai.key', '');
        if ($apiKey === '') {
            return $this->json(['ok' => false, 'error' => 'Spoken replies are not configured on this server.'], 503);
        }

        try {
            $response = Http::withToken($apiKey)
                ->timeout(60)
                ->post('https://api.openai.com/v1/audio/speech', [
                    'model' => (string) config('speech.model', 'gpt-4o-mini-tts'),
                    'voice' => $voice,
                    'input' => $text,
                    'response_format' => 'mp3',
                ]);
        } catch (Throwable $error) {
            report($error);
            return $this->json(['ok' => false, 'error' => 'Vibyra could not reach the speech service.'], 502);
        }

        if (! $response->successful()) {
            return $this->json([
                'ok' => false,
                'error' => $this->speechFailureMessage($response->body()),
            ], $response->status() === 429 ? 429 : 502);
        }

        // Charged only once audio exists: a failed request must not cost credits.
        $deductor->spend($user, $credits, 'speech', null, [
            'voice' => $voice,
            'characters' => mb_strlen($text),
        ]);

        return response($response->body(), 200, [
            'Content-Type' => 'audio/mpeg',
            'Cache-Control' => 'no-store',
            'X-Vibyra-Credits-Spent' => (string) $credits,
        ]);
    }

    /** Priced per character, which is how the upstream bills it, then through
     * the same cents-to-credits conversion every other call uses. */
    private function speechCredits(string $text): int
    {
        $usdPerThousand = (float) config('speech.usd_per_1k_chars', 0.015);
        $usd = (mb_strlen($text) / 1000.0) * $usdPerThousand;
        $minimum = (int) config('billing.minimum_credit_charge', 1);

        return (int) max($minimum, ceil($usd * 100.0));
    }

    private function defaultSpeechVoice(): string
    {
        $voice = strtolower(trim((string) config('speech.voice', 'alloy')));

        return in_array($voice, self::SPEECH_VOICES, true) ? $voice : 'alloy';
    }

    /** The upstream's own words when it explains itself, ours when it does not. */
    private function speechFailureMessage(string $body): string
    {
        $decoded = json_decode($body, true);
        $message = is_array($decoded) ? ($decoded['error']['message'] ?? null) : null;

        return is_string($message) && $message !== ''
            ? $message
            : 'The speech service could not read that aloud.';
    }
}
