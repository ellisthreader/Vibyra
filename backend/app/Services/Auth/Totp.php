<?php

namespace App\Services\Auth;

/**
 * Time-based one-time passwords, RFC 6238, in the shape every authenticator app
 * already agrees on: a 160-bit shared secret in base32, SHA-1, six digits, thirty
 * seconds. Those four are not preferences. An app that is handed anything else --
 * SHA-256, eight digits -- may silently show codes this server will never accept,
 * so the setup link states them and this file is the only place they are decided.
 */
class Totp
{
    public const DIGITS = 6;
    public const PERIOD = 30;
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** A fresh shared secret, 160 bits, as the 32 base32 characters an app expects. */
    public function secret(): string
    {
        $bits = '';
        foreach (str_split(random_bytes(20)) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }
        $secret = '';
        // 160 bits divide evenly into 32 groups of five, so the secret needs no padding.
        foreach (str_split($bits, 5) as $group) {
            $secret .= self::ALPHABET[bindec($group)];
        }

        return $secret;
    }

    /**
     * The `otpauth://` link an authenticator reads, by scanning it or by being opened
     * with it. The label carries the issuer twice -- once before the colon and once as
     * a parameter -- because older apps read only one of the two and a code filed under
     * the wrong name is a code nobody can find again.
     */
    public function uri(string $secret, string $account, string $issuer): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($account);

        return 'otpauth://totp/' . $label . '?' . http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => self::DIGITS,
            'period' => self::PERIOD,
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * The time slot a code belongs to, or null when it belongs to none of them.
     *
     * One slot either side of now is accepted, which covers a phone whose clock has
     * drifted and a code typed as it expired. The slot is returned rather than a
     * plain yes so the caller can refuse a code that has already been used: without
     * that, anyone who watches a code being typed has thirty more seconds to use it.
     */
    public function verify(string $secret, string $code, int $window = 1): ?int
    {
        $code = preg_replace('/\D+/', '', $code) ?? '';
        if (strlen($code) !== self::DIGITS) {
            return null;
        }
        $key = $this->decode($secret);
        if ($key === '') {
            return null;
        }
        $now = intdiv(time(), self::PERIOD);
        for ($slot = $now - $window; $slot <= $now + $window; $slot++) {
            if (hash_equals($this->at($key, $slot), $code)) {
                return $slot;
            }
        }

        return null;
    }

    /** The code for one slot, so a test can be exact about time rather than sleep. */
    public function at(string $key, int $slot): string
    {
        $hash = hash_hmac('sha1', pack('J', $slot), $key, true);
        $offset = ord($hash[19]) & 0x0f;
        $value = unpack('N', substr($hash, $offset, 4))[1] & 0x7fffffff;

        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    /** The raw key behind a base32 secret; an empty string when the secret is malformed. */
    public function decode(string $secret): string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $secret) ?? '');
        $bits = '';
        foreach (str_split($clean) as $character) {
            $index = strpos(self::ALPHABET, $character);
            if ($index === false) {
                return '';
            }
            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }
        $key = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $key .= chr(bindec($byte));
            }
        }

        return $key;
    }
}
