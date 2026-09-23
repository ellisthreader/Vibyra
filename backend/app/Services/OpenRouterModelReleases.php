<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class OpenRouterModelReleases
{
    public function sync(): int
    {
        $response = Http::timeout(15)->acceptJson()->get((string) config('model_releases.source_url'));
        if (! $response->successful() || ! is_array($response->json('data'))) {
            throw new RuntimeException('OpenRouter model roster is unavailable.');
        }

        $models = $this->normalize($response->json('data'));
        if ($models === []) {
            throw new RuntimeException('OpenRouter returned an empty model roster.');
        }

        $released = DB::transaction(function () use ($models): int {
            $known = array_fill_keys(DB::table('openrouter_model_releases')->pluck('model_id')->all(), true);
            $baseline = $known === [];
            $now = now();
            $released = 0;
            foreach ($models as $id => $name) {
                if (isset($known[$id])) {
                    continue;
                }
                $inserted = DB::table('openrouter_model_releases')->insertOrIgnore([
                    'model_id' => $id,
                    'name' => $name,
                    'released_at' => $baseline ? null : $now,
                ]);
                if (! $baseline) {
                    $released += $inserted;
                }
            }

            return $released;
        });

        $this->deliverPending();

        return $released;
    }

    public function feed(?int $after): array
    {
        $latest = (int) DB::table('openrouter_model_releases')->max('id');
        if ($after === null) {
            return ['cursor' => $latest, 'releases' => []];
        }

        $rows = DB::table('openrouter_model_releases')
            ->whereNotNull('released_at')->where('id', '>', $after)
            ->orderBy('id')->limit(100)->get(['id', 'model_id', 'name']);

        return [
            'cursor' => $rows->last()?->id ?? $after,
            'releases' => $rows->map(fn ($row) => [
                'cursor' => $row->id,
                'id' => $row->model_id,
                'name' => $row->name,
            ])->all(),
        ];
    }

    private function normalize(array $raw): array
    {
        $models = [];
        foreach ($raw as $model) {
            if (! is_array($model)) {
                continue;
            }
            $id = explode(':', (string) ($model['id'] ?? ''), 2)[0];
            if (! preg_match('/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i', $id)
                || strlen($id) > 160) {
                continue;
            }
            $models[$id] ??= mb_substr(trim((string) ($model['name'] ?? '')) ?: $id, 0, 180);
        }

        return $models;
    }

    private function deliverPending(): void
    {
        $webhook = trim((string) config('model_releases.discord_webhook_url'));
        $parts = parse_url($webhook);
        if (! is_array($parts) || ($parts['scheme'] ?? '') !== 'https'
            || ! in_array($parts['host'] ?? '', ['discord.com', 'discordapp.com'], true)
            || ! preg_match('~^/api/webhooks/[0-9]+/[^/]+$~', $parts['path'] ?? '')) {
            return;
        }

        $pending = DB::table('openrouter_model_releases')->whereNotNull('released_at')
            ->whereNull('discord_attempted_at')->orderBy('id')->limit(20)->get();
        foreach ($pending as $model) {
            $claimed = DB::table('openrouter_model_releases')->where('id', $model->id)
                ->whereNull('discord_attempted_at')
                ->update(['discord_attempted_at' => now()]);
            if ($claimed !== 1) {
                continue;
            }
            try {
                $response = Http::timeout(8)->post($webhook, [
                    'allowed_mentions' => ['parse' => []],
                    'embeds' => [[
                        'title' => 'New AI model released',
                        'description' => $model->name.' — `'.$model->model_id.'`',
                        'color' => 0x5b7cfa,
                    ]],
                ]);
                if ($response->successful()) {
                    DB::table('openrouter_model_releases')->where('id', $model->id)
                        ->update(['discord_delivered_at' => now()]);
                }
            } catch (\Throwable) {}
        }
    }
}
