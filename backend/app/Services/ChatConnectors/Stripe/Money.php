<?php

namespace App\Services\ChatConnectors\Stripe;

/** Stripe API units, including its backward-compatible ISK/UGX representation. */
final class Money
{
    public static function format(int $amount, string $currency): string
    {
        $currency = strtolower($currency);
        $digits = in_array($currency, ['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'vnd', 'vuv', 'xaf', 'xof', 'xpf']) ? 0
            : (in_array($currency, ['bhd', 'jod', 'kwd', 'omr', 'tnd']) ? 3 : 2);
        $sign = $amount < 0 ? '-' : '';
        $raw = ltrim((string) $amount, '-');
        if (!$digits) return $sign.$raw;
        $raw = str_pad($raw, $digits + 1, '0', STR_PAD_LEFT);
        $whole = substr($raw, 0, -$digits); $fraction = substr($raw, -$digits);
        if (in_array($currency, ['isk', 'ugx']) && (int) $fraction === 0) return $sign.$whole;
        return $sign.$whole.'.'.$fraction;
    }
}
