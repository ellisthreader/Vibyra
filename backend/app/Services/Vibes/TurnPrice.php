<?php

namespace App\Services\Vibes;

/**
 * The price of one turn, in Vibes. This lives apart from `Quotes` because the
 * Auto router has to answer the same question before it chooses - a router that
 * picked a model and effort the quote then refused with 422 would be worse than
 * no router at all - and two copies of the arithmetic would drift the first time
 * either was tuned. `Quotes` prices the turn it sends with these methods, so the
 * number the router weighed is by construction the number the person is charged.
 */
final class TurnPrice
{
    /**
     * Reasoning tokens are billed as completion tokens and are drawn from the same
     * `max_tokens` budget as the answer, so a deep-thinking turn given the flat
     * allowance can spend all of it thinking and return nothing. The allowance
     * therefore grows with the level asked for, by enough that the configured
     * answer budget still survives the share reasoning takes (roughly 80% at the
     * top of the ladder on Anthropic-family routes) rather than merely growing.
     */
    public const OUTPUT_SCALE = ['none' => 1.0, 'minimal' => 1.2, 'low' => 1.5,
        'medium' => 2.5, 'high' => 5.0, 'xhigh' => 8.0, 'max' => 10.0];

    /** The hard per-turn ceiling. A turn priced above this cannot be sent at all. */
    public const CEILING = 50;

    public static function scale(?string $effort): float
    {
        return self::OUTPUT_SCALE[$effort] ?? 1.0;
    }

    /** The `max_tokens` this effort is given, which is also what it is priced for. */
    public static function outputTokens(?string $effort): int
    {
        return (int) ceil((int) config('vibes.max_output_tokens') * self::scale($effort));
    }

    /**
     * Bytes per token. Real tokenizers land near 3.5-4 bytes a token on English
     * prose and 3-3.5 on source code, and UTF-8 CJK - three bytes a character,
     * roughly a token a character - sits at 3.0 exactly. Three is at or below all
     * of them, so no script is priced under what it truly costs.
     *
     * This used to be 1.0 in effect: the encoded prompt was counted as if every
     * byte were a token, over-stating the input side of every quote three- to
     * four-fold. Nobody was ever overcharged for it, because `Turns::settle` bills
     * the provider's own figure rather than the estimate - but the composer showed
     * that inflated number as "up to N Vibes", `CEILING` refused conversations
     * costing a fraction of it, and a small balance could not reserve turns it
     * could easily afford. The conservatism bought nothing either, because
     * `RunVibesTurn` re-derives the remaining budget before every step and trims
     * the output allowance to fit, so an under-reservation is cut short mid-run
     * instead of being overspent.
     */
    public const BYTES_PER_TOKEN = 3.0;

    /**
     * A conservative token bound on the prompt, from the bytes that will be sent.
     * The per-message pad covers the role and envelope fields a provider counts
     * against the turn; it is a token count already, so it is added after the
     * conversion rather than run through it. Eight is double the four ChatML
     * charges, which keeps the bound above the real figure without restoring the
     * old three-fold inflation.
     */
    public static function inputBound(array $messages, array $tools = []): int
    {
        // Tool schemas are sent with every prompt and are billed like any other
        // input, so a turn that offers them has to be priced for carrying them.
        $bytes = strlen((string) json_encode($messages))
            + ($tools ? strlen((string) json_encode($tools)) : 0);

        return (int) ceil($bytes / self::BYTES_PER_TOKEN) + count($messages) * 8;
    }

    /**
     * Whole Vibes, rounded up once for the turn. `input_cache_write` is taken when
     * it is dearer than the prompt rate, because a first turn on a caching route
     * pays the write price rather than the read price.
     */
    public static function credits(int $inputBound, ?string $effort, array $pricing): int
    {
        return max(1, (int) ceil(self::usd($inputBound, $effort, $pricing) * 100));
    }

    /**
     * The same turn before it is rounded into whole Vibes. Rounding is right for a
     * bill and wrong for a comparison: below about a penny every model in the
     * catalogue costs exactly one Vibe, so a router comparing rounded credits cannot
     * see that one candidate is thirty times dearer than another and will happily
     * spend it. What a person is charged still comes from `credits()`.
     */
    public static function usd(int $inputBound, ?string $effort, array $pricing): float
    {
        $input = max((float) ($pricing['prompt'] ?? 0), (float) ($pricing['input_cache_write'] ?? 0));

        return ($inputBound * $input + self::outputTokens($effort) * (float) ($pricing['completion'] ?? 0)) * 1.1;
    }
}
