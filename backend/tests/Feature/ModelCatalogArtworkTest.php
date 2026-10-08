<?php

namespace Tests\Feature;

use App\Services\ModelCatalog\Artwork;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ModelCatalogArtworkTest extends TestCase
{
    use RefreshDatabase;

    public function test_generated_artwork_is_immutable_durable_and_generated_only_once(): void
    {
        $source = imagecreatetruecolor(128, 128);
        ob_start(); imagepng($source); $png = ob_get_clean(); imagedestroy($source);
        config(['model_catalog.artwork' => true, 'model_catalog.image_key' => 'image-test',
            'model_catalog.image_model' => 'fixture/image', 'model_catalog.asset_origin' => 'https://catalog.test']);
        DB::table('model_catalog_models')->insert(['id' => 'openai/gpt-99', 'fingerprint' => str_repeat('a', 64),
            'metadata' => '{}', 'status' => 'eligible', 'seen_at' => now(), 'verified_at' => now()]);
        Http::fake(['https://openrouter.ai/api/v1/images' => Http::response(['data' => [['b64_json' => base64_encode($png)]]])]);
        $this->assertSame(1, app(Artwork::class)->run());
        $this->assertSame(0, app(Artwork::class)->run());
        Http::assertSentCount(1);
        $asset = json_decode(DB::table('model_catalog_models')->value('artwork'), true);
        $reply = $this->get('/web-api/model-catalog/artwork/'.$asset['sha256'])->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->assertSame($asset['sha256'], hash('sha256', $reply->getContent()));
        $this->assertSame([256, 256], array_slice(getimagesizefromstring($reply->getContent()), 0, 2));
        DB::table('model_catalog_artwork')->update(['png_base64' => base64_encode('corrupted')]);
        $this->get('/web-api/model-catalog/artwork/'.$asset['sha256'])->assertNotFound();
    }

    public function test_active_content_cannot_become_an_icon(): void
    {
        $this->expectException(\RuntimeException::class);
        app(Artwork::class)->raster('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    }
}
