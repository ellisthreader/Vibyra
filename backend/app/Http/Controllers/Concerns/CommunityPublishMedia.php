<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Support\Str;

trait CommunityPublishMedia
{
    private function publishImageUrls(mixed $value): array
    {
        $items = is_array($value) ? $value : [$value];
        return array_values(array_filter(array_map(fn ($url) => $this->publishImageUrl((string) $url), $items)));
    }

    private function publishImageUrl(string $url): ?string
    {
        $url = trim($url);
        if ($url === '') return null;
        if (preg_match('/^https:\/\/[^\s]+$/i', $url) === 1) return Str::limit($url, 2000, '');
        if (
            strlen($url) <= (int) config('moderation.max_image_data_url_characters', 7000000)
            && preg_match('/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+\/=\r\n]+$/i', $url) === 1
        ) return $url;
        return null;
    }
}
