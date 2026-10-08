<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class Artwork
{
    public function run(): int
    {
        if (! config('model_catalog.artwork') || ! config('model_catalog.image_key')
            || ! config('model_catalog.image_model') || ! function_exists('imagecreatefromstring')) return 0;
        $attempt = null;
        foreach (DB::table('model_catalog_models')->where('status', 'eligible')->whereNull('artwork')->orderBy('id')->get() as $row) {
            $previous = DB::table('model_catalog_attempts')->where('model_id', $row->id)->where('kind', 'artwork')->orderBy('created_at')->get();
            if ($previous->count() >= 3 || $previous->contains(fn ($a) => in_array($a->state, ['dispatching', 'unknown', 'succeeded'], true))) continue;
            if ($previous->last() && \Illuminate\Support\Carbon::parse($previous->last()->created_at)->gt(now()->subMinutes(15))) continue;
            $version = hash('sha256', $row->id.':vibyra-icon-1:'.$previous->count());
            $attempt = app(Attempts::class)->claim($row->id, $version, 'artwork', config('model_catalog.image_reserve_micro'));
            if ($attempt) break;
        }
        if (! $attempt) return 0;
        try {
            $response = Http::withToken(config('model_catalog.image_key'))->timeout(120)
                ->withOptions(['allow_redirects' => false])->post('https://openrouter.ai/api/v1/images', [
                    'model' => config('model_catalog.image_model'), 'n' => 1, 'aspect_ratio' => '1:1',
                    'prompt' => 'A polished minimal sculptural icon for a coding model. Graphite background, '
                        .'one distinct cobalt or violet glass form, soft studio light, clear silhouette readable at 24 pixels. '
                        .'Square crop, no words, letters, logos, border, people or interface. '
                        .'Use this identifier only as a visual seed: '.json_encode($row->id),
                ]);
            if (! $response->successful() || strlen($response->body()) > 16000000) throw new RuntimeException('Image unavailable.');
            $bytes = base64_decode((string) $response->json('data.0.b64_json'), true);
            if (! $bytes || strlen($bytes) > 10000000) throw new RuntimeException('Invalid image.');
            $png = $this->raster($bytes);
            $hash = hash('sha256', $png);
            // Shared durable storage: assets survive deploys and are available to every web replica.
            DB::table('model_catalog_artwork')->insertOrIgnore([
                'sha256' => $hash, 'png_base64' => base64_encode($png), 'created_at' => now(),
            ]);
            $art = ['sha256' => $hash, 'url' => rtrim(config('model_catalog.asset_origin'), '/')
                .'/web-api/model-catalog/artwork/'.$hash, 'width' => 256, 'height' => 256];
            DB::table('model_catalog_models')->where('id', $row->id)->update(['artwork' => json_encode($art)]);
            app(Attempts::class)->finish($attempt, 'succeeded');
            return 1;
        } catch (\Illuminate\Http\Client\ConnectionException) {
            app(Attempts::class)->finish($attempt, 'unknown');
        } catch (\Throwable) {
            app(Attempts::class)->finish($attempt, 'failed');
        }
        return 0;
    }

    public function raster(string $bytes): string
    {
        $info = @getimagesizefromstring($bytes);
        if (! $info || ! in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG, IMAGETYPE_WEBP], true)
            || $info[0] < 128 || $info[1] < 128 || $info[0] > 4096 || $info[1] > 4096
            || abs($info[0] - $info[1]) > 8) throw new RuntimeException('Invalid icon dimensions.');
        $source = @imagecreatefromstring($bytes);
        if (! $source) throw new RuntimeException('Invalid raster.');
        $target = imagecreatetruecolor(256, 256);
        imagecopyresampled($target, $source, 0, 0, 0, 0, 256, 256, $info[0], $info[1]);
        ob_start();
        imagepng($target);
        $png = ob_get_clean();
        imagedestroy($source);
        imagedestroy($target);
        return $png;
    }
}
