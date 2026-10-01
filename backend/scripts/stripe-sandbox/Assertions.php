<?php

namespace VibyraSandbox;

/** Assertions use purchased grants, not unrelated trial allowances. */
final class Assertions
{
    public static function verify(array $s, string $phase): bool
    {
        $p = $s['periods'];
        $count = count($p);
        $units = $s['offerUnits'];
        $all = fn ($fn) => $count > 0 && count(array_filter($p, $fn)) === $count;
        if ($s['failedEvents'] || !$s['testOnly']) return false;
        if (in_array($phase, ['paid', 'renewed', 'cancelled', 'won'], true) && ($s['fundingBlocked'] ?? false)) return false;
        if ($s['subscription'] && in_array($phase, ['paid', 'renewed', 'cancelled', 'won'], true)
            && $s['tier'] !== 'pro') return false;
        return match ($phase) {
            'pending' => $count === 0 && $s['grantUnits'] === 0,
            'paid' => $count === 1 && $s['grantUnits'] === $units && $s['remainingUnits'] === $units,
            'renewed' => $count === 2 && $s['grantUnits'] === 2 * $units && $s['remainingUnits'] === 2 * $units,
            'cancelled' => $all(fn ($r) => $r['cancelAtEnd']) && $s['remainingUnits'] === $s['grantUnits'],
            'ended' => $s['subscription'] && $count > 0 && $s['tier'] === 'free'
                && $all(fn ($r) => $r['endsAt'] !== null && strtotime($r['endsAt']) <= $s['asOf']),
            'failed-renewal' => ($s['failureEvidence'] ?? false) && $s['subscription'] && $count === 1 && $s['grantUnits'] === $units
                && $s['remainingUnits'] === $units && $s['tier'] === 'free'
                && $p[0]['endsAt'] !== null && strtotime($p[0]['endsAt']) <= $s['asOf'],
            'partial-refund' => $count === 1 && $p[0]['refundedMinor'] === 100
                && $p[0]['revokedUnits'] === intdiv($units * 100, $s['offerPence'])
                && $s['remainingUnits'] === $units - $p[0]['revokedUnits'],
            'full-refund' => $count === 1 && $p[0]['refundedMinor'] === $s['offerPence']
                && $p[0]['revokedUnits'] === $units && $s['remainingUnits'] === 0,
            'disputed' => $all(fn ($r) => $r['disputed']) && (!$s['subscription'] || $s['tier'] === 'free'),
            'won' => ($s['wonEvidence'] ?? false) && $all(fn ($r) => !$r['disputed'] && !$r['revoked'])
                && $s['remainingUnits'] === $s['grantUnits'],
            'lost' => $all(fn ($r) => $r['disputed'] && $r['revoked']) && $s['remainingUnits'] === 0,
            default => false,
        };
    }
}
