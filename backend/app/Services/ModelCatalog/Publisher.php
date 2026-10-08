<?php

namespace App\Services\ModelCatalog;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class Publisher
{
    public function publish(?int $rollback = null): ?int
    {
        if (! config('model_catalog.publish')) return null;
        return DB::transaction(function () use ($rollback) {
            DB::table('model_catalog_state')->insertOrIgnore(['id' => 1]);
            $state = DB::table('model_catalog_state')->where('id', 1)->lockForUpdate()->first();
            $current = $state->revision ? DB::table('model_catalog_revisions')->find($state->revision) : null;
            $disabled = DB::table('model_catalog_models')->where(function ($q) {
                $q->where('status', '!=', 'eligible')->orWhereNull('verified_at')
                    ->orWhere('verified_at', '<', now()->subHours(config('model_catalog.proof_hours')));
            })->pluck('id')->merge(config('model_catalog.quarantined'))->unique()->sort()->values()->all();
            if ($rollback !== null) {
                $past = DB::table('model_catalog_revisions')->find($rollback);
                if (! $past) throw new RuntimeException('Unknown catalog revision.');
                $models = json_decode($past->payload, true, 64, JSON_THROW_ON_ERROR)['models'];
            } else {
                $models = DB::table('model_catalog_models')->where('status', 'eligible')
                    ->where('verified_at', '>=', now()->subHours(config('model_catalog.proof_hours')))
                    ->where('misses', '<', 3)->whereNotIn('id', config('model_catalog.quarantined'))
                    ->orderBy('id')->get()->map(function ($row) {
                        $m = json_decode($row->metadata, true, 32, JSON_THROW_ON_ERROR);
                        return [...$m, 'artwork' => $row->artwork ? json_decode($row->artwork, true) : null];
                    })->all();
            }
            // Preserve names/history when every route is paused, but explicitly disable them.
            if (! $models && $current) $models = json_decode($current->payload, true, 64, JSON_THROW_ON_ERROR)['models'];
            if (! $models) return null;
            $content = hash('sha256', json_encode([$models, $disabled], JSON_THROW_ON_ERROR));
            if ($rollback === null && $current?->content_hash === $content) return (int) $current->id;
            $encoded = (string) config('model_catalog.signing_key');
            if (! preg_match('/^[a-f0-9]{128}$/', $encoded)) throw new RuntimeException('Catalog signing key is not configured.');
            $key = hex2bin($encoded);
            if (! $key || strlen($key) !== SODIUM_CRYPTO_SIGN_SECRETKEYBYTES) throw new RuntimeException('Catalog signing key is not configured.');
            $revision = DB::table('model_catalog_revisions')->insertGetId([
                'content_hash' => $content, 'payload' => '', 'signature' => '',
                'key_id' => config('model_catalog.key_id'), 'created_at' => now(),
            ]);
            $payload = json_encode(['schema' => 1, 'revision' => $revision,
                'publishedAt' => now()->timestamp, 'models' => $models, 'disabled' => $disabled], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
            DB::table('model_catalog_revisions')->where('id', $revision)->update([
                'payload' => $payload, 'signature' => bin2hex(sodium_crypto_sign_detached($payload, $key)),
            ]);
            DB::table('model_catalog_state')->where('id', 1)->update(['revision' => $revision]);
            return $revision;
        });
    }
}
