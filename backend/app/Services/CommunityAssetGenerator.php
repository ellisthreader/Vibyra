<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class CommunityAssetGenerator
{
    public function generate(string $kind, string $title, string $description, string $prompt): array
    {
        $image = $this->generateWithOpenRouter($kind, $title, $description, $prompt);
        return ['imageUrl' => $image, 'provider' => 'openrouter'];
    }

    private function generateWithOpenRouter(string $kind, string $title, string $description, string $prompt): string
    {
        $apiKey = (string) config('services.openrouter.key', '');
        if ($apiKey === '') {
            throw new RuntimeException('OpenRouter image generation is not configured. Set OPENROUTER_API_KEY to generate publish images.');
        }

        $aspectRatio = $kind === 'screenshot' ? '16:9' : '1:1';
        $brief = $kind === 'screenshot'
            ? 'Create a polished App Store style product screenshot for this software project. Show a complete realistic app screen, no device frame, no tiny illegible text.'
            : 'Create a simple modern app icon or logo for this software project. Centered symbol, polished production-ready icon, no words, transparent-safe composition.';

        try {
            $response = Http::timeout(90)->acceptJson()->withToken($apiKey)
                ->withHeaders([
                    'HTTP-Referer' => (string) config('app.url', 'https://vibyra.app'),
                    'X-Title' => 'Vibyra',
                ])
                ->post((string) config('services.openrouter.url'), [
                    'model' => (string) config('services.openrouter.image_model', 'openai/gpt-image-1'),
                    'messages' => [[
                        'role' => 'user',
                        'content' => trim($brief."\nProject: {$title}\nDescription: {$description}\nUser direction: {$prompt}"),
                    ]],
                    'modalities' => ['image'],
                    'image_config' => [
                        'aspect_ratio' => $aspectRatio,
                        'image_size' => '1K',
                        'output_format' => 'png',
                        'quality' => 'low',
                    ],
                    'stream' => false,
                ]);
        } catch (\Throwable $error) {
            throw new RuntimeException('OpenRouter image generation failed. Try again in a moment.', previous: $error);
        }

        if (! $response->successful()) {
            $message = (string) ($response->json('error.message') ?? 'OpenRouter image generation failed.');
            throw new RuntimeException($message);
        }

        $image = $this->extractImageUrl($response->json());
        if ($image !== '') return $image;

        throw new RuntimeException('OpenRouter image generation did not return an image.');
    }

    private function extractImageUrl(mixed $value): string
    {
        if (is_string($value)) {
            return str_starts_with($value, 'data:image/') || str_starts_with($value, 'https://') ? $value : '';
        }

        if (! is_array($value)) return '';

        foreach (['url', 'image_url', 'imageUrl'] as $key) {
            if (! array_key_exists($key, $value)) continue;
            $image = $this->extractImageUrl($value[$key]);
            if ($image !== '') return $image;
        }

        foreach ($value as $item) {
            $image = $this->extractImageUrl($item);
            if ($image !== '') return $image;
        }

        return '';
    }
}
