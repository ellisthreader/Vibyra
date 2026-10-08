<?php

namespace App\Services\ModelCatalog;

use App\Services\Billing\OpenRouterPricingNormalizer;
use App\Services\Billing\OpenRouterReasoning;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class Discovery
{
    public function run(): int
    {
        $response = Http::timeout(20)->acceptJson()->get(config('model_catalog.source_url'));
        if (strlen($response->body()) > 8000000) throw new RuntimeException('Model roster too large.');
        $models = app(OpenRouterPricingNormalizer::class)->fromResponse($response);
        if (! $models || count($models) > config('model_catalog.max_models')) {
            throw new RuntimeException('Model discovery failed; previous catalog retained.');
        }
        $rows = array_filter(array_map(fn ($m) => Policy::normalize($m), OpenRouterReasoning::apply($models)));
        if (! $rows) throw new RuntimeException('Empty supported roster; previous catalog retained.');
        return DB::transaction(function () use ($rows) {
            DB::table('model_catalog_state')->insertOrIgnore(['id' => 1]);
            DB::table('model_catalog_state')->where('id', 1)->lockForUpdate()->first();
            $known = DB::table('model_catalog_models')->get()->keyBy('id');
            foreach ($rows as $m) {
                $json = json_encode($m, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
                $fingerprint = hash('sha256', $json);
                $old = $known->get($m['id']);
                $patch = ['fingerprint' => $fingerprint, 'metadata' => $json, 'seen_at' => now(), 'misses' => 0];
                if (! $old || $old->fingerprint !== $fingerprint || $old->status === 'deprecated') {
                    $patch += ['status' => 'discovered', 'reason' => null, 'verified_at' => null, 'proof' => null];
                }
                DB::table('model_catalog_models')->updateOrInsert(['id' => $m['id']], $patch);
            }
            $missing = DB::table('model_catalog_models')->whereNotIn('id', array_column($rows, 'id'));
            (clone $missing)->increment('misses');
            (clone $missing)->where('misses', '>=', 3)->update(['status' => 'deprecated', 'reason' => 'absent-from-source']);
            DB::table('model_catalog_state')->where('id', 1)->update(['last_discovery_at' => now()]);
            return count($rows);
        });
    }
}
