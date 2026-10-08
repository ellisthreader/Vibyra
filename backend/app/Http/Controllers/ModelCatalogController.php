<?php

namespace App\Http\Controllers;

use App\Services\ModelCatalog\PublishedCatalog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class ModelCatalogController extends Controller
{
    public function health(\App\Services\ModelCatalog\Health $health)
    {
        $status = $health->status();
        return response()->json($status, $status['healthy'] ? 200 : 503, ['Cache-Control' => 'no-store']);
    }
    public function index(Request $request, PublishedCatalog $catalog)
    {
        $envelope = $catalog->envelope();
        abort_unless($envelope, 503, 'Model updates are being prepared.');
        $etag = '"'.hash('sha256', $envelope['payload']).'"';
        $headers = ['ETag' => $etag, 'Cache-Control' => 'public, max-age=60'];
        if ($request->header('If-None-Match') === $etag) return response('', 304, $headers);
        return response()->json($envelope, 200, $headers);
    }

    public function artwork(string $hash)
    {
        abort_unless(preg_match('/^[a-f0-9]{64}$/', $hash), 404);
        $encoded = DB::table('model_catalog_artwork')->where('sha256', $hash)->value('png_base64');
        $png = $encoded ? base64_decode($encoded, true) : false;
        abort_unless($png && hash_equals($hash, hash('sha256', $png)), 404);
        return response($png, 200, ['Content-Type' => 'image/png',
            'Cache-Control' => 'public, max-age=31536000, immutable', 'X-Content-Type-Options' => 'nosniff']);
    }
}
