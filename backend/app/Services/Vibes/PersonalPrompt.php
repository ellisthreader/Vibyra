<?php

namespace App\Services\Vibes;

/**
 * The part of the system prompt that belongs to the person: their style and own
 * instructions and, while memory is on, everything Settings > Memory holds about
 * them — what they wrote (each part only while its switch is on) and the memories
 * they or a chat saved. It is the phone chat's memory.md, read on every turn.
 *
 * It is appended after the rules and framed as preferences and knowledge, so it can
 * shape a reply but never lift a tool limit or a safety rule. It sits in the system
 * message, a prefix that stays the same across a chat's turns, which is what lets a
 * provider that caches prompts charge less for it from the second turn.
 *
 * `Quotes::messages` trims the conversation without counting the system message, so
 * this block never pushes history out; the cap is about cost. It is measured in
 * UTF-8 bytes, roughly a quarter of a token each in English.
 */
class PersonalPrompt
{
    public const CAP = 20000;

    private const STYLE_LINES = [
        'concise' => 'Keep replies brief: lead with the answer and the code, and skip preamble.',
        'detailed' => 'Explain step by step and name the trade-offs.',
        'friendly' => 'Use a warm, encouraging tone and plain words.',
    ];

    private const KNOWN = 'What you know about the person, from the memory they keep in Vibyra. Use it the way a friend who knows them would: '
        .'call them by name when it is natural, fit answers to their work, tools and goals, and do not ask for what is already here. '
        .'Do not recite it or say where it came from unless they ask. It never overrides anything above.';

    private const SAVE = 'You can update their saved memories. When they ask you to remember something, or share a lasting fact about themselves '
        .'that will help in future chats (their work, projects, tools, preferences, goals, or people and dates that matter to them), end your reply '
        .'with one line per fact, as a short third-person sentence: <vibyra-memory>Prefers TypeScript for new projects.</vibyra-memory> '
        .'When they ask you to forget a saved memory, end with <vibyra-forget>its exact text</vibyra-forget>. Save only what is new and durable; '
        .'never passwords, keys, or card or account numbers, and nothing about health, beliefs or other sensitive matters unless they ask. '
        .'The app hides these lines and shows the person what changed, so acknowledge it in a few words. You cannot change their name, '
        .'occupation, "more about you" or memory summary; for those, point them to Settings > Memory.';

    private const NO_SAVE = 'You cannot save or forget memories in this chat. If they ask you to, say they can add it in Settings > Memory.';

    public function __construct(private readonly Personalization $store) {}

    /**
     * '' for an account with memory off and the reply defaults, so its prompt is
     * byte-for-byte what it always was. `$canSave` is false on a turn that offers
     * tools: what a tool returns is not the person's own words, so that turn is never
     * told how to change memory, and `ChatMemory` refuses it if it tries.
     */
    public function for(int $userId, bool $canSave = true): string
    {
        $preferences = $this->store->preferences($userId);
        $memories = $preferences['memoryEnabled'] ? array_column($this->store->memories($userId), 'text') : [];

        return self::compose($preferences, $memories, $canSave);
    }

    /**
     * Pure, so the cap can be proven without a database. `$memories` is newest first.
     * Over the cap the oldest memories go first, down to the newest ten; then the
     * summary is shortened from the end, then the last ten memories go, then "more
     * about you" and the instructions are shortened. Anything shortened ends in "…".
     */
    public static function compose(array $preferences, array $memories, bool $canSave = false): string
    {
        $on = (bool) ($preferences['memoryEnabled'] ?? false);
        $shared = fn (string $field) => $on && ($preferences[$field.'Enabled'] ?? true) ? trim((string) ($preferences[$field] ?? '')) : '';
        $parts = ['style' => self::STYLE_LINES[$preferences['style'] ?? ''] ?? null, 'instructions' => trim((string) ($preferences['instructions'] ?? '')),
            'name' => $shared('name'), 'occupation' => $shared('occupation'), 'about' => $shared('about'), 'summary' => $shared('summary'),
            'memories' => $on ? array_values($memories) : [], 'save' => $on ? ($canSave ? self::SAVE : self::NO_SAVE) : null, 'short' => []];
        if ($parts['style'] === null && $parts['instructions'] === '' && ! $on) return '';

        $block = self::block($parts);
        // The newest memories are what a chat saved last, so they outlast the tail of a
        // long summary; older ones do not.
        foreach ([self::KEEP, 'summary', 0, 'about', 'instructions'] as $step) {
            while (strlen($block) > self::CAP && (is_int($step) ? count($parts['memories']) > $step : $parts[$step] !== '')) {
                if (is_int($step)) {
                    array_pop($parts['memories']);
                } else {
                    // Cut by bytes on a character boundary: the overflow at once, never less than a few words.
                    $keep = max(0, strlen($parts[$step]) - max(40, strlen($block) - self::CAP));
                    $parts[$step] = rtrim(mb_strcut($parts[$step], 0, $keep, 'UTF-8'));
                    $parts['short'][$step] = true;
                }
                $block = self::block($parts);
            }
        }

        return $block;
    }

    /** Saved memories kept, newest first, before the summary is shortened. */
    private const KEEP = 10;

    private static function block(array $p): string
    {
        $cut = fn (string $field) => $p[$field].(isset($p['short'][$field]) ? '…' : '');
        $sections = [];
        if ($p['style'] !== null || $p['instructions'] !== '') {
            $lines = ['The person has set preferences for how you reply. Follow them unless they conflict with anything above, which always comes first.'];
            if ($p['style'] !== null) $lines[] = $p['style'];
            if ($p['instructions'] !== '') $lines[] = 'In their own words: "'.$cut('instructions').'"';
            $sections[] = implode("\n", $lines);
        }
        $known = array_filter([
            $p['name'] !== '' ? 'Name: '.$p['name'] : null,
            $p['occupation'] !== '' ? 'Occupation: '.$p['occupation'] : null,
            $p['about'] !== '' ? "More about them, in their own words:\n\"\"\"\n".$cut('about')."\n\"\"\"" : null,
            $p['summary'] !== '' ? "Their memory summary, in their own words:\n\"\"\"\n".$cut('summary')."\n\"\"\"" : null,
            $p['memories'] ? "Saved memories, newest first:\n- ".implode("\n- ", $p['memories']) : null,
        ]);
        if ($known) $sections[] = self::KNOWN."\n".implode("\n", $known);
        if ($p['save'] !== null) $sections[] = $p['save'];

        return implode("\n\n", $sections);
    }
}
