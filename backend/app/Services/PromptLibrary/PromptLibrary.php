<?php

namespace App\Services\PromptLibrary;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/*
 * Saved prompts, kept inside the account's `app_state.promptLibrary`. Every device
 * sends what it has and gets the merge back. Per prompt id the copy updated last wins;
 * a deletion is a tombstone (`deletedAt`) so it beats an older edit made elsewhere, and
 * on an exact tie the deletion stays. Mirrors mobile/src/prompts/model.ts.
 */
class PromptLibrary
{
    public const MAX_PROMPTS = 50;

    public const MAX_TITLE = 60;

    public const MAX_TEXT = 2000;

    public const TOMBSTONE_DAYS = 90;

    public function enabled(): bool
    {
        return (bool) config('prompt_library.enabled');
    }

    /** @return array<int, array{id: string, title: string, text: string, updatedAt: string, deletedAt?: string}> */
    public function normalize(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }
        $byId = [];
        foreach ($value as $item) {
            $prompt = is_array($item) ? $this->normalizeOne($item) : null;
            if ($prompt === null) {
                continue;
            }
            $known = $byId[$prompt['id']] ?? null;
            if ($known === null || strcmp($known['updatedAt'], $prompt['updatedAt']) <= 0) {
                $byId[$prompt['id']] = $prompt;
            }
        }

        return array_values($byId);
    }

    public function merge(array $a, array $b, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now('UTC');
        $byId = [];
        foreach ([...$this->normalize($a), ...$this->normalize($b)] as $prompt) {
            $known = $byId[$prompt['id']] ?? null;
            $order = $known === null ? 1 : strcmp($known['updatedAt'], $prompt['updatedAt']) * -1;
            if ($known === null || $order > 0 || ($order === 0 && isset($prompt['deletedAt']))) {
                $byId[$prompt['id']] = $prompt;
            }
        }
        $cutoff = $now->subDays(self::TOMBSTONE_DAYS)->format('Y-m-d\TH:i:s.v\Z');
        $kept = array_filter($byId, fn ($p) => ! isset($p['deletedAt']) || strcmp($p['deletedAt'], $cutoff) >= 0);
        $live = array_filter($kept, fn ($p) => ! isset($p['deletedAt']));
        usort($live, fn ($x, $y) => strcmp($y['updatedAt'], $x['updatedAt']));
        $dropped = array_flip(array_column(array_slice($live, self::MAX_PROMPTS), 'id'));

        return array_values(array_filter($kept, fn ($p) => ! isset($dropped[$p['id']])));
    }

    /**
     * Merges what a device sent into the account's library under a row lock, so two
     * devices syncing together cannot lose each other's prompts, and returns the result.
     */
    public function sync(User $user, mixed $incoming): array
    {
        return DB::transaction(function () use ($user, $incoming) {
            $locked = User::query()->lockForUpdate()->findOrFail($user->id);
            $state = is_array($locked->app_state) ? $locked->app_state : [];
            $existing = is_array($state['promptLibrary']['prompts'] ?? null) ? $state['promptLibrary']['prompts'] : [];
            $merged = $this->merge($existing, is_array($incoming) ? $incoming : []);
            if ($merged !== $existing) {
                $state['promptLibrary'] = ['prompts' => $merged];
                $locked->forceFill(['app_state' => $state])->save();
            }

            return $merged;
        });
    }

    public function payload(User $user): array
    {
        $stored = is_array($user->app_state['promptLibrary']['prompts'] ?? null) ? $user->app_state['promptLibrary']['prompts'] : [];

        return ['enabled' => $this->enabled(), 'prompts' => $this->enabled() ? $this->normalize($stored) : []];
    }

    private function normalizeOne(array $item): ?array
    {
        $id = $item['id'] ?? null;
        $at = $this->stamp($item['updatedAt'] ?? null);
        if (! is_string($id) || ! preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) || $at === null) {
            return null;
        }
        $title = mb_substr(trim(is_string($item['title'] ?? null) ? $item['title'] : ''), 0, self::MAX_TITLE);
        $text = mb_substr(is_string($item['text'] ?? null) ? $item['text'] : '', 0, self::MAX_TEXT);
        $deleted = $this->stamp($item['deletedAt'] ?? null);
        if ($deleted !== null) {
            return ['id' => $id, 'title' => '', 'text' => '', 'updatedAt' => $at, 'deletedAt' => $deleted];
        }

        return $title === '' || trim($text) === '' ? null : ['id' => $id, 'title' => $title, 'text' => $text, 'updatedAt' => $at];
    }

    /** One canonical UTC format, so every device compares the same strings. */
    private function stamp(mixed $value): ?string
    {
        if (! is_string($value) || strlen($value) > 40) {
            return null;
        }
        try {
            return CarbonImmutable::parse($value)->utc()->format('Y-m-d\TH:i:s.v\Z');
        } catch (\Throwable) {
            return null;
        }
    }
}
