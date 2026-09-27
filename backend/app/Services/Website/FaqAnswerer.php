<?php

namespace App\Services\Website;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * Answers a visitor's own question on the homepage from the FAQ knowledge.
 *
 * One small OpenAI completion (gpt-5-nano, low reasoning) per distinct
 * question; the same question (ignoring case, spacing and punctuation) is
 * served from cache for a day, so a popular question costs one call.
 *
 * The token budget covers the model's hidden reasoning as well as the reply,
 * so it is set well above the length of an answer. If a question still reasons
 * its way through the whole budget, the retry turns reasoning down instead of
 * failing, because an empty reply is worse than a plainer one.
 */
class FaqAnswerer
{
    public const MAX_QUESTION_CHARS = 600;
    private const MAX_TOKENS = 1600;
    private const CACHE_TTL_SECONDS = 86400;

    public function __construct(private readonly FaqKnowledge $knowledge)
    {
    }

    public static function model(): string
    {
        return (string) config('services.openai.faq_model', 'gpt-5-nano');
    }

    /** @return array{answer: string, cached: bool} */
    public function answer(string $question): array
    {
        $knowledgeHash = sha1($this->knowledge->text());
        $key = 'website-faq:'.sha1(self::model().'|'.$knowledgeHash.'|'.$this->normalise($question));
        $cached = Cache::get($key);
        if (is_string($cached) && $cached !== '') {
            return ['answer' => $cached, 'cached' => true];
        }

        $answer = $this->ask($question);
        Cache::put($key, $answer, self::CACHE_TTL_SECONDS);

        return ['answer' => $answer, 'cached' => false];
    }

    private function ask(string $question): string
    {
        $reasoning = (string) config('services.openai.faq_reasoning', 'low');
        $answer = $this->extract($this->post($question, $reasoning));

        if ($answer === '' && $reasoning !== 'minimal') {
            $answer = $this->extract($this->post($question, 'minimal'));
        }
        if ($answer === '') {
            throw new RuntimeException('The answer service returned nothing.');
        }

        return Str::limit($answer, 1200, '…');
    }

    private function post(string $question, string $reasoning): Response
    {
        $apiKey = (string) config('services.openai.key');
        if ($apiKey === '') {
            throw new RuntimeException('OpenAI is not configured.');
        }

        try {
            $response = Http::timeout(30)
                ->acceptJson()
                ->withToken($apiKey)
                ->post((string) config('services.openai.chat_url'), [
                    'model' => self::model(),
                    'reasoning_effort' => $reasoning,
                    'max_completion_tokens' => self::MAX_TOKENS,
                    'messages' => [
                        ['role' => 'system', 'content' => $this->systemPrompt()],
                        ['role' => 'user', 'content' => $question],
                    ],
                ]);
        } catch (Throwable $error) {
            throw new RuntimeException('Could not reach the answer service.', 0, $error);
        }

        if (! $response->successful()) {
            throw new RuntimeException('The answer service returned '.$response->status().': '.(string) $response->json('error.message'));
        }

        return $response;
    }

    private function extract(Response $response): string
    {
        $content = $response->json('choices.0.message.content');
        if (is_array($content)) {
            $content = implode('', array_map(fn ($part) => is_array($part) ? (string) ($part['text'] ?? '') : (string) $part, $content));
        }

        return trim(preg_replace("/\n{3,}/", "\n\n", preg_replace('/[ \t]+/u', ' ', (string) $content) ?? '') ?? '');
    }

    private function systemPrompt(): string
    {
        return "You answer visitors' questions on the Vibyra website. Use only the knowledge below.\n\n"
            .$this->knowledge->text();
    }

    private function normalise(string $question): string
    {
        $flat = mb_strtolower(trim($question));
        $flat = preg_replace('/[^\p{L}\p{N}\s]/u', '', $flat) ?? $flat;

        return trim(preg_replace('/\s+/u', ' ', $flat) ?? $flat);
    }
}
