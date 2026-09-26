<?php

namespace App\Services\Vibes;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * How the phone chat speaks to one person, and what it remembers about them: their
 * style and instructions, what they wrote about themselves on Settings > Memory
 * (each part with its own switch), and the short memories they or a chat saved.
 *
 * A missing preferences row is the defaults, so nothing is written for an account
 * until it changes something. Callers hand in validated values; this class owns
 * storage and the memory limit, and `PersonalPrompt` turns it all into prompt text.
 */
class Personalization
{
    public const STYLES = ['balanced', 'concise', 'detailed', 'friendly'];
    public const INSTRUCTIONS_MAX = 1000;
    public const MEMORY_MAX = 200;
    public const MEMORY_LIMIT = 50;
    /** What a person writes about themselves, by the longest each may be. */
    public const PROFILE = ['name' => 60, 'occupation' => 120, 'about' => 1500, 'summary' => 8000];

    /** Payload key => column, for everything `update` may change. */
    private const COLUMNS = ['style' => 'style', 'instructions' => 'instructions', 'memoryEnabled' => 'memory_enabled',
        'name' => 'name', 'nameEnabled' => 'name_enabled', 'occupation' => 'occupation', 'occupationEnabled' => 'occupation_enabled',
        'about' => 'about', 'aboutEnabled' => 'about_enabled', 'summary' => 'summary', 'summaryEnabled' => 'summary_enabled'];

    public function preferences(int $userId): array
    {
        $row = DB::table('vibes_preferences')->where('user_id', $userId)->first();
        $preferences = [
            'style' => $row && in_array($row->style, self::STYLES, true) ? $row->style : 'balanced',
            'instructions' => (string) ($row->instructions ?? ''),
            'memoryEnabled' => $row === null || (bool) $row->memory_enabled,
        ];
        foreach (array_keys(self::PROFILE) as $field) {
            $preferences[$field] = (string) ($row->{$field} ?? '');
            $preferences[$field.'Enabled'] = $row === null || (bool) $row->{$field.'_enabled'};
        }

        return $preferences;
    }

    /** Only the keys present in `$changes` move; the rest keep their stored value. */
    public function update(int $userId, array $changes): array
    {
        $changes = array_intersect_key($changes, self::COLUMNS);
        $next = [...$this->preferences($userId), ...$changes];
        $row = ['user_id' => $userId, 'created_at' => now(), 'updated_at' => now()];
        foreach (self::COLUMNS as $key => $column) $row[$column] = $next[$key];
        // An upsert rather than read-then-insert, so two first saves racing on a new
        // account cannot both try to create the row. An existing row has only the
        // columns sent overwritten, so a switch and a field saved at the same moment
        // cannot put back each other's old value.
        $moved = array_values(array_intersect_key(self::COLUMNS, $changes));
        DB::table('vibes_preferences')->upsert([$row], ['user_id'], [...$moved, 'updated_at']);

        return $this->preferences($userId);
    }

    /** Newest first. Ids are time-ordered, so two saved in the same second still sort. */
    public function memories(int $userId): array
    {
        return DB::table('vibes_memories')->where('user_id', $userId)
            ->orderByDesc('created_at')->orderByDesc('id')->limit(self::MEMORY_LIMIT)
            ->get(['id', 'text', 'source', 'created_at'])
            ->map(fn (object $memory) => $this->payload($memory))->all();
    }

    /**
     * Null when the account already keeps as many as it may. `$source` is 'chat' for
     * one a chat saved, with the turn that saved it, so the list can say where it came from.
     */
    public function remember(int $userId, string $text, string $source = 'user', ?string $turnId = null): ?array
    {
        return DB::transaction(function () use ($userId, $text, $source, $turnId) {
            // Serialised per account, so two adds racing at the limit cannot both land.
            DB::table('users')->where('id', $userId)->lockForUpdate()->first();
            if (DB::table('vibes_memories')->where('user_id', $userId)->count() >= self::MEMORY_LIMIT) {
                return null;
            }
            $memory = (object) ['id' => (string) Str::uuid7(), 'text' => $text, 'source' => $source, 'created_at' => now()];
            DB::table('vibes_memories')->insert(['id' => $memory->id, 'user_id' => $userId, 'text' => $text,
                'source' => $source, 'turn_id' => $turnId, 'created_at' => $memory->created_at, 'updated_at' => $memory->created_at]);

            return $this->payload($memory);
        });
    }

    /** False when it is not this account's memory, which includes one already removed. */
    public function forget(int $userId, string $id): bool
    {
        return DB::table('vibes_memories')->where('id', $id)->where('user_id', $userId)->delete() > 0;
    }

    public function forgetAll(int $userId): void
    {
        DB::table('vibes_memories')->where('user_id', $userId)->delete();
    }

    private function payload(object $memory): array
    {
        return ['id' => $memory->id, 'text' => $memory->text, 'source' => $memory->source === 'chat' ? 'chat' : 'user',
            'createdAt' => Carbon::parse($memory->created_at)->toIso8601String()];
    }
}
