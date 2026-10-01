<?php

namespace VibyraSandbox;

/** Pure guard: evaluated before Laravel can open a connection or call Stripe. */
final class Safety
{
    public static function check(array $env): string
    {
        $db = (string) ($env['DB_DATABASE'] ?? '');
        $root = realpath(dirname($db));
        $temp = realpath(sys_get_temp_dir());
        $testKey = fn ($key) => is_string($key) && (preg_match('/^(sk|rk)_test_[A-Za-z0-9]+$/D', $key)
            || (($env['STRIPE_SANDBOX_CLAIMABLE'] ?? '') === '1' && preg_match('/^rkcs_[A-Za-z0-9_]+$/D', $key)));
        if (($env['VIBYRA_STRIPE_SANDBOX'] ?? '') !== '1'
            || ($env['APP_ENV'] ?? '') !== 'local'
            || ($env['DB_CONNECTION'] ?? '') !== 'sqlite'
            || !empty($env['DB_URL']) || !$root || !$temp
            || dirname($root) !== $temp || !str_starts_with(basename($root), 'vibyra-stripe-sandbox-')
            || basename($db) !== 'billing.sqlite' || !is_file($db) || is_link($db)
            || realpath($db) !== $root.'/billing.sqlite'
            || !$testKey($env['STRIPE_SECRET_KEY'] ?? null)
            || !$testKey($env['STRIPE_SANDBOX_OPERATOR_KEY'] ?? null)
            || ($env['MEMBERSHIP_STRIPE_ENVIRONMENT'] ?? '') !== 'test') {
            throw new \RuntimeException('Refused: explicit local disposable SQLite and sandbox keys required.');
        }
        return $root;
    }
}
