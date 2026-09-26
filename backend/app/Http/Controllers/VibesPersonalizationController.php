<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\UserPayloads;
use App\Services\ContentModeration;
use App\Services\Vibes\Personalization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Settings > Personality and Settings > Memory on the phone.
 *
 * A guest may use both. It is the same `users` row an account becomes at sign-up,
 * so what a guest chooses is still there afterwards. Neither spends anything, so
 * neither is gated on `vibes.enabled`; only what they change in a quote costs.
 *
 * Every refusal is `{ ok: false, error }`, the shape the phone reads, rather than
 * Laravel's validation body. A 404 that carries `error` is this controller; one
 * without it is a server that has no such route yet, which the phone tells apart.
 */
class VibesPersonalizationController extends Controller
{
    use UserPayloads;

    public function __construct(private readonly Personalization $store, private readonly ContentModeration $moderation) {}

    public function preferences(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request, allowGuest: true);

        return $this->json(['ok' => true, 'preferences' => $this->store->preferences($user->id)]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        $changes = $this->validPreferences($request);
        if (is_string($changes)) return $this->refuse($changes);
        // Words the model will be told to follow or to know: checked as a name is, locally.
        foreach (['instructions', ...array_keys(Personalization::PROFILE)] as $field) {
            if (($changes[$field] ?? '') !== '') $this->moderation->assertLocalTextAllowed($changes[$field], 'vibes.'.$field);
        }

        return $this->json(['ok' => true, 'preferences' => $this->store->update($user->id, $changes)]);
    }

    public function memories(Request $request): JsonResponse
    {
        return $this->memoryList($this->authenticatedUser($request, allowGuest: true)->id);
    }

    public function remember(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        $text = $request->input('text');
        // One line each: the prompt lists memories as bullets, and a newline inside
        // one would read as a second memory the person never wrote.
        $text = is_string($text) ? trim((string) preg_replace('/\s+/u', ' ', $text)) : '';
        if ($text === '') return $this->refuse('Write something for Vibyra to remember.');
        if (mb_strlen($text) > Personalization::MEMORY_MAX) return $this->refuse('Keep each memory to 200 characters.');
        $this->moderation->assertLocalTextAllowed($text, 'vibes.memory');
        $memory = $this->store->remember($user->id, $text);
        if ($memory === null) return $this->refuse('You can keep up to 50 memories. Remove one to add another.');

        return $this->memoryList($user->id, ['memory' => $memory]);
    }

    public function forget(Request $request, string $memory): JsonResponse
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        // Another account's memory reads exactly like one already removed.
        if (! $this->store->forget($user->id, $memory)) return $this->refuse('That memory was already removed.', 404);

        return $this->memoryList($user->id);
    }

    public function forgetAll(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request, allowGuest: true);
        $this->store->forgetAll($user->id);

        return $this->memoryList($user->id);
    }

    /** The fields sent, each valid, or the sentence explaining the first that is not. */
    private function validPreferences(Request $request): array|string
    {
        $changes = [];
        if ($request->has('style')) {
            $style = $request->input('style');
            if (! is_string($style) || ! in_array($style, Personalization::STYLES, true)) {
                return 'Choose Balanced, Concise, Detailed or Friendly.';
            }
            $changes['style'] = $style;
        }
        if ($request->has('instructions')) {
            $words = $request->input('instructions');
            if ($words !== null && ! is_string($words)) return 'Instructions must be text.';
            $words = trim(str_replace(["\r\n", "\r"], "\n", (string) $words));
            if (mb_strlen($words) > Personalization::INSTRUCTIONS_MAX) return 'Keep instructions to 1,000 characters.';
            $changes['instructions'] = $words;
        }
        foreach (Personalization::PROFILE as $field => $max) {
            if (! $request->has($field)) continue;
            $words = $request->input($field);
            if ($words !== null && ! is_string($words)) return self::PROFILE_NAMES[$field].' must be text.';
            $words = trim(str_replace(["\r\n", "\r"], "\n", (string) $words));
            // A name and an occupation are one line each; the prompt gives each one line.
            if ($field === 'name' || $field === 'occupation') $words = (string) preg_replace('/\s+/u', ' ', $words);
            if (mb_strlen($words) > $max) return 'Keep '.lcfirst(self::PROFILE_NAMES[$field]).' to '.number_format($max).' characters.';
            $changes[$field] = $words;
        }
        foreach (['memoryEnabled', ...array_map(fn ($field) => $field.'Enabled', array_keys(Personalization::PROFILE))] as $switch) {
            if (! $request->has($switch)) continue;
            $enabled = $request->input($switch);
            if (! is_bool($enabled)) return 'Turn '.($switch === 'memoryEnabled' ? 'memory' : lcfirst(self::PROFILE_NAMES[substr($switch, 0, -7)])).' on or off.';
            $changes[$switch] = $enabled;
        }

        return $changes;
    }

    /** How each part of Settings > Memory is named in a refusal. */
    private const PROFILE_NAMES = ['name' => 'Your name', 'occupation' => 'Your occupation',
        'about' => '“More about you”', 'summary' => 'Your memory summary'];

    private function memoryList(int $userId, array $extra = []): JsonResponse
    {
        return $this->json(['ok' => true, ...$extra, 'memories' => $this->store->memories($userId),
            'limit' => Personalization::MEMORY_LIMIT]);
    }

    private function refuse(string $error, int $status = 422): JsonResponse
    {
        return $this->json(['ok' => false, 'error' => $error], $status);
    }
}
