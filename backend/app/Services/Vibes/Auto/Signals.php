<?php

namespace App\Services\Vibes\Auto;

/**
 * What one prompt measurably is. Everything here is read straight off the text -
 * no model call, no network, no database - because this runs on every pause in
 * typing while the composer re-quotes, and a router that cost a request per
 * keystroke would be worse than the constant it replaces.
 *
 * Lexical evidence and structural evidence are kept apart on purpose. Phrases say
 * what someone is asking for; length, code, paths, stack traces and enumerated
 * requirements say how much there is to do. A prompt can be loud in one and silent
 * in the other, and the pair is far harder to fool than either alone.
 */
final class Signals
{
    private function __construct(
        public readonly float $difficulty,
        public readonly float $deliberation,
        public readonly float $mechanical,
        public readonly float $brevity,
        public readonly float $breadth,
        /** @var array<string, float> specialty name => 0..1 */
        public readonly array $specialty,
        public readonly int $words,
        public readonly int $codeBytes,
        public readonly int $paths,
        public readonly bool $stackTrace,
        public readonly int $constraints,
        public readonly int $steps,
        public readonly int $contextBytes,
        public readonly int $historyTurns,
    ) {}

    public static function of(string $text, int $historyBytes = 0, int $historyTurns = 0): self
    {
        $text = self::clamp($text);
        $lower = mb_strtolower($text);
        // Fenced and indented code is measured, then removed before words are counted:
        // a 300-line paste is not a 300-word question, and treating it as one made
        // every pasted file look like a sprawling multi-part request.
        $code = self::codeBytes($text);
        $prose = self::withoutCode($lower);
        $specialty = [];
        foreach (Lexicon::SPECIALTY as $name => $table) $specialty[$name] = self::evidence($lower, $table);

        return new self(
            difficulty: self::evidence($lower, Lexicon::DIFFICULTY),
            deliberation: self::evidence($lower, Lexicon::DELIBERATION),
            mechanical: self::evidence($lower, Lexicon::MECHANICAL),
            brevity: self::evidence($lower, Lexicon::BREVITY),
            breadth: self::evidence($lower, Lexicon::BREADTH),
            specialty: $specialty,
            words: self::words($prose),
            codeBytes: $code,
            paths: self::paths($text),
            stackTrace: self::stackTrace($text),
            constraints: self::count($prose, self::CONSTRAINT),
            steps: self::count($text, self::STEP),
            contextBytes: max(0, $historyBytes) + strlen($text),
            historyTurns: max(0, $historyTurns),
        );
    }

    /**
     * Independent evidence, combined as a noisy-OR rather than a sum. Each matched
     * phrase is one more reason to believe, so the result rises towards 1 and never
     * past it; repeating a phrase adds nothing, because the same reason twice is
     * still one reason. A sum would have to be clamped, and a clamped sum makes a
     * prompt with six weak hints indistinguishable from one with a decisive phrase.
     */
    private static function evidence(string $haystack, array $table): float
    {
        $miss = 1.0;
        foreach ($table as $phrase => $weight) {
            if (preg_match(self::pattern($phrase), $haystack) === 1) $miss *= 1.0 - $weight;
        }

        return round(1.0 - $miss, 4);
    }

    /**
     * A phrase becomes a boundary-anchored pattern. A trailing `*` drops the closing
     * boundary so `optimi*` reaches optimise and optimization, and a phrase that
     * starts or ends on punctuation (` vs `, `ci/cd`, `tl;dr`) keeps that edge bare,
     * because `\b` beside a non-word character asserts the opposite of what is meant.
     */
    private static function pattern(string $phrase): string
    {
        static $cache = [];
        if (isset($cache[$phrase])) return $cache[$phrase];
        $prefix = str_ends_with($phrase, '*');
        $body = $prefix ? substr($phrase, 0, -1) : $phrase;
        $lead = preg_match('/^\w/u', $body) === 1 ? '\b' : '';
        $tail = ! $prefix && preg_match('/\w$/u', $body) === 1 ? '\b' : '';

        return $cache[$phrase] = '/'.$lead.preg_quote($body, '/').$tail.'/iu';
    }

    /** Requirements stated as rules. Each one is another thing an answer must hold. */
    private const CONSTRAINT = '/\b(?:must|should|ensure|make sure|has to|needs? to|never|always|avoid|without|only if|do not|don\'t|cannot|can\'t|required?)\b/iu';

    /** Enumerated or bulleted parts: an answer has to cover every one of them. */
    private const STEP = '/^[ \t]*(?:\d{1,2}[.)]|[-*\x{2022}])[ \t]+\S/mu';

    /** A path or filename someone expects the answer to be about. */
    private const PATH = '/(?:[\w.@-]+\/)+[\w.@-]+|\b[\w-]+\.(?:tsx?|jsx?|php|rs|py|go|java|kt|swift|rb|cs|c|h|cpp|css|scss|html|json|ya?ml|toml|sql|sh|md)\b/u';

    /** Evidence that something already went wrong and the output is the report. */
    private const TRACE = '/\b(?:traceback|stack ?trace|panicked at|unhandled (?:exception|rejection))\b|^\s*at [\w.$<>\[\]]+ ?\(|\b[A-Z]\w*(?:Error|Exception)\b:|^\s*File "[^"]+", line \d+/mu';

    private static function count(string $text, string $pattern): int
    {
        return (int) preg_match_all($pattern, $text);
    }

    private static function paths(string $text): int
    {
        preg_match_all(self::PATH, $text, $found);

        return count(array_unique($found[0] ?? []));
    }

    private static function stackTrace(string $text): bool
    {
        return preg_match(self::TRACE, $text) === 1;
    }

    /** Fenced blocks, plus indented runs long enough not to be an accident. */
    private static function codeBytes(string $text): int
    {
        $bytes = 0;
        if (preg_match_all('/```.*?(?:```|\z)/su', $text, $fenced)) $bytes += strlen(implode('', $fenced[0]));
        if (preg_match_all('/(?:^[ \t]{4,}\S.*\n?){3,}/mu', $text, $indented)) $bytes += strlen(implode('', $indented[0]));

        return $bytes;
    }

    private static function withoutCode(string $lower): string
    {
        $stripped = preg_replace('/```.*?(?:```|\z)/su', ' ', $lower) ?? $lower;

        return preg_replace('/`[^`\n]*`/u', ' ', $stripped) ?? $stripped;
    }

    private static function words(string $prose): int
    {
        return (int) preg_match_all('/[\p{L}\p{N}][\p{L}\p{N}\'-]*/u', $prose);
    }

    /**
     * The composer already caps a message at 4000 characters, but the router is a
     * service and must not depend on one caller's validation for its own worst case.
     */
    private static function clamp(string $text): string
    {
        return strlen($text) > 24000 ? substr($text, 0, 24000) : $text;
    }
}
