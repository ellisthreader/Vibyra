<?php

namespace App\Services\Moderation;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Throwable;

trait RemoteModeration
{
    protected function remoteDecision(string|array $input, string $surface, ?bool $failClosed = null): array
    {
        $apiKey = (string) config('services.openai.key', '');

        if ($apiKey === '') {
            return $this->missingRemoteDecision($surface, $failClosed);
        }

        try {
            $response = Http::timeout((int) config('moderation.timeout_seconds', 12))
                ->acceptJson()
                ->withToken($apiKey)
                ->post((string) config('services.openai.moderation_url'), [
                    'model' => (string) config('services.openai.moderation_model', 'omni-moderation-latest'),
                    'input' => $input,
                ]);
        } catch (Throwable) {
            return $this->remoteUnavailableDecision($surface, $failClosed);
        }

        if (! $response->successful()) {
            return $this->remoteUnavailableDecision($surface, $failClosed);
        }

        $result = (array) ($response->json('results.0') ?? []);
        $categories = (array) ($result['categories'] ?? []);
        $scores = (array) ($result['category_scores'] ?? []);
        $flaggedCategories = array_keys(array_filter($categories));
        $thresholdCategories = $this->thresholdFlaggedCategories($scores);

        if (($result['flagged'] ?? false) || $flaggedCategories !== [] || $thresholdCategories !== []) {
            return $this->blockedDecision($surface, implode(', ', array_unique([...$flaggedCategories, ...$thresholdCategories])) ?: 'openai_flagged', 'openai_moderation');
        }

        return $this->allowedDecision($surface);
    }

    protected function moderationItems(array $input): array
    {
        $items = [];
        $text = trim((string) Arr::get($input, 'text', ''));

        if ($text !== '') {
            $items[] = ['type' => 'text', 'text' => $text];
        }

        foreach ((array) Arr::get($input, 'images', []) as $image) {
            $url = is_array($image) ? (string) Arr::get($image, 'url', '') : (string) $image;

            if (! $this->validImageUrl($url)) {
                throw new HttpResponseException(response()->json([
                    'ok' => false,
                    'error' => 'Screenshots must be HTTPS URLs or PNG/JPEG/WebP/GIF data URLs.',
                ], 422));
            }

            $items[] = ['type' => 'image_url', 'image_url' => ['url' => $url]];
        }

        return $items;
    }

    protected function validImageUrl(string $url): bool
    {
        if ($url === '') {
            return false;
        }

        if (str_starts_with($url, 'https://')) {
            return true;
        }

        if (! preg_match('/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+\/=\r\n]+$/i', $url)) {
            return false;
        }

        return strlen($url) <= (int) config('moderation.max_image_data_url_characters', 7000000);
    }

    protected function thresholdFlaggedCategories(array $scores): array
    {
        $flagged = [];

        foreach ((array) config('moderation.thresholds', []) as $category => $threshold) {
            if ((float) ($scores[$category] ?? 0) >= (float) $threshold) {
                $flagged[] = (string) $category;
            }
        }

        return $flagged;
    }

    protected function missingRemoteDecision(string $surface, ?bool $failClosed = null): array
    {
        if ($failClosed ?? (bool) config('moderation.fail_closed', true)) {
            return $this->blockedDecision($surface, 'moderation_unavailable', 'missing_openai_api_key', 'OpenAI moderation is not configured.');
        }

        return $this->allowedDecision($surface, 'OpenAI moderation is not configured; local comment filters were applied.');
    }

    protected function remoteUnavailableDecision(string $surface, ?bool $failClosed = null): array
    {
        if ($failClosed ?? (bool) config('moderation.fail_closed', true)) {
            return $this->blockedDecision($surface, 'moderation_unavailable', 'openai_unavailable', 'OpenAI moderation could not be reached. Please try again.');
        }

        return $this->allowedDecision($surface, 'OpenAI moderation could not be reached; local comment filters were applied.');
    }
}
