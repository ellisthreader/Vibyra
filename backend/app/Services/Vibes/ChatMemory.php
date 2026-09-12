<?php

namespace App\Services\Vibes;

use App\Services\ContentModeration;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The chat's side of Settings > Memory. A reply may end with lines that save a fact
 * about the person or forget one (`PersonalPrompt` tells the model how). This takes
 * them out of every reply, so the person never reads them and later history never
 * carries them, and carries them out only on a turn that may change memory.
 *
 * A turn may change memory when memory is on, the turn was not stopped, and it
 * offered no tools: what a project file or a connected account returns is not the
 * person's own words, and a memory planted there would follow them into every chat.
 * When a photo or file came with the message, the person's own words must also ask
 * to remember or forget. What changed is kept on the turn for the transcript.
 */
class ChatMemory
{
    /** At most this many saves, and this many forgets, from one reply. */
    private const MOST = 3;
    private const DIRECTIVE = '/<vibyra-(memory|forget)>(.*?)<\/vibyra-\1>/isu';
    /** A directive the output limit cut off before it closed. */
    private const DANGLING = '/<vibyra-(?:memory|forget)>(?:(?!<\/vibyra-).)*$/isu';
    private const ASKED = '/\b(remember|memori[sz]e|memory|forget|save (?:this|that|it)|note (?:this|that|down)|keep in mind)\b/iu';
    /** Credentials and numbers that must never sit in a prompt sent with every message. */
    private const SECRETS = [
        '/-----BEGIN [A-Z ]*PRIVATE KEY-----/',
        '/\b(?:sk|pk|rk)[-_](?:live_|test_|proj-)?[A-Za-z0-9_-]{16,}/',
        '/\b(?:ghp|gho|ghs|ghu|github_pat|xox[abpr]|AKIA|AIza)[A-Za-z0-9_-]{12,}/',
        '/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/',
        '/\b(?:\d[ -]?){13,19}\b/',
        '/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/',
        '/\b(?:password|passcode|passwd|pin|cvv|cvc)\s*(?:is|was|=|:)\s*\S/i',
        '/\b(?:seed|recovery) phrase\b/i',
    ];

    public function __construct(private readonly Personalization $store, private readonly ContentModeration $moderation) {}

    /** The reply as the person should read it. Never throws: a memory problem must not cost the reply. */
    public function settle(object $turn, array $request, string $text): string
    {
        ['text' => $clean, 'saves' => $saves, 'forgets' => $forgets] = self::extract($text);
        if (! $saves && ! $forgets) return $clean;
        try {
            $changes = $this->allowed($turn, $request) ? $this->apply((int) $turn->user_id, (string) $turn->id, $saves, $forgets) : null;
            if ($changes) DB::table('vibes_turns')->where('id', $turn->id)->update(['memory' => json_encode($changes)]);
        } catch (Throwable) {
            $changes = null;
        }
        if ($clean !== '') return $clean;

        // A reply that was nothing but memory lines still has to say something.
        return match (true) {
            ! empty($changes['saved']) => 'Got it — I’ll remember that.',
            ! empty($changes['forgotten']) => 'Done — I’ve forgotten that.',
            default => 'I can’t change your memory from this chat. You can add it in Settings > Memory.',
        };
    }

    /**
     * Pure, so the parsing can be proven on its own. Fenced code is never searched,
     * so a reply that shows these tags in a code sample keeps them.
     *
     * @return array{text: string, saves: list<string>, forgets: list<string>}
     */
    public static function extract(string $text): array
    {
        $saves = $forgets = [];
        $pieces = preg_split('/(```.*?(?:```|$))/su', $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$text];
        $found = false;
        foreach ($pieces as $index => $piece) {
            if ($index % 2 === 1) continue;
            $piece = (string) preg_replace_callback(self::DIRECTIVE, function (array $match) use (&$saves, &$forgets, &$found) {
                $found = true;
                $line = self::line($match[2]);
                if ($line !== '' && strtolower($match[1]) === 'memory') $saves[] = $line;
                elseif ($line !== '') $forgets[] = $line;

                return '';
            }, $piece);
            if ($index === count($pieces) - 1 && preg_match(self::DANGLING, $piece) === 1) {
                $piece = (string) preg_replace(self::DANGLING, '', $piece);
                $found = true;
            }
            // Only the prose around a removed line is tidied; code is left as written.
            $pieces[$index] = $found ? (string) preg_replace(["/[ \t]+(?=\n|$)/", "/\n{3,}/"], ['', "\n\n"], $piece) : $piece;
        }

        return ['text' => $found ? trim(implode('', $pieces)) : $text, 'saves' => $saves, 'forgets' => $forgets];
    }

    private function allowed(object $turn, array $request): bool
    {
        $fresh = DB::table('vibes_turns')->where('id', $turn->id)->first(['cancel_requested', 'prompt']);
        if (! $fresh || $fresh->cancel_requested) return false;
        if (! empty($request['tools']) || collect($request['messages'] ?? [])->contains('role', 'tool')) return false;
        if (! $this->store->preferences((int) $turn->user_id)['memoryEnabled']) return false;
        $attached = DB::table('vibes_attachments')->where('turn_id', $turn->id)->exists();

        return ! $attached || preg_match(self::ASKED, (string) $fresh->prompt) === 1;
    }

    private function apply(int $userId, string $turnId, array $saves, array $forgets): ?array
    {
        // Forgetting first, so "I moved to Berlin" can replace a London memory at the limit.
        $forgotten = [];
        foreach (array_slice($forgets, 0, self::MOST) as $target) {
            $memory = $this->match($userId, $target);
            if ($memory && $this->store->forget($userId, $memory->id)) $forgotten[] = $memory->text;
        }
        $saved = [];
        $full = false;
        $known = array_map(fn (array $memory) => self::key($memory['text']), $this->store->memories($userId));
        foreach (array_slice($saves, 0, self::MOST) as $text) {
            $text = self::fit($text);
            if (in_array(self::key($text), $known, true) || self::secret($text) || ! $this->moderated($text)) continue;
            $memory = $this->store->remember($userId, $text, 'chat', $turnId);
            if ($memory === null) { $full = true; break; }
            $saved[] = ['id' => $memory['id'], 'text' => $memory['text']];
            $known[] = self::key($text);
        }

        return array_filter(['saved' => $saved, 'forgotten' => $forgotten, 'full' => $full]) ?: null;
    }

    /** The memory meant: the same words, or the only one that contains them (or is contained). */
    private function match(int $userId, string $target): ?object
    {
        $key = self::key($target);
        if ($key === '') return null;
        $mine = DB::table('vibes_memories')->where('user_id', $userId)->get(['id', 'text']);
        $same = $mine->first(fn (object $memory) => self::key($memory->text) === $key);
        if ($same || mb_strlen($key) < 8) return $same;
        $near = $mine->filter(function (object $memory) use ($key) {
            $theirs = self::key($memory->text);

            return mb_strlen($theirs) >= 8 && (str_contains($theirs, $key) || str_contains($key, $theirs));
        });

        return $near->count() === 1 ? $near->first() : null;
    }

    private function moderated(string $text): bool
    {
        try { $this->moderation->assertLocalTextAllowed($text, 'vibes.memory'); return true; } catch (Throwable) { return false; }
    }

    private static function secret(string $text): bool
    {
        foreach (self::SECRETS as $pattern) if (preg_match($pattern, $text) === 1) return true;

        return false;
    }

    /** One line, as the list shows it: no bullet, no wrapping quotes, no inner tags. */
    private static function line(string $raw): string
    {
        $line = trim((string) preg_replace('/\s+/u', ' ', strip_tags($raw)));
        $line = (string) preg_replace('/^(?:[-•*]\s+)/u', '', $line);

        return preg_match('/^(["“‘\'])(.*)(["”’\'])$/u', $line, $quoted) === 1 ? trim($quoted[2]) : $line;
    }

    /** Within the list's 200 characters, cut on a word where it has to be. */
    private static function fit(string $text): string
    {
        if (mb_strlen($text) <= Personalization::MEMORY_MAX) return $text;
        $cut = mb_substr($text, 0, Personalization::MEMORY_MAX - 1);
        $space = mb_strrpos($cut, ' ');

        return rtrim($space > 120 ? mb_substr($cut, 0, $space) : $cut, ' ,;:').'…';
    }

    /** How two memories are compared: case, spacing and closing punctuation aside. */
    private static function key(string $text): string
    {
        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text), " .!?\"'“”‘’"));
    }
}
