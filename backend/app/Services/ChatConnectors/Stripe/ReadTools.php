<?php

namespace App\Services\ChatConnectors\Stripe;

use DateTimeImmutable;
use DateTimeZone;

final class ReadTools
{
    public const NAMES = ['stripe_account', 'stripe_projects', 'stripe_revenue'];

    public static function definitions(): array
    {
        $s = ['type' => 'string'];
        $items = [
            ['stripe_account', 'Read the identity of the connected Stripe account. Confirm which project/account the user means before reporting project revenue.', [], []],
            ['stripe_projects', 'Discover project metadata on the latest 100 charges. A sample, not an exhaustive project list. Do not infer project identity from payment descriptions.', [], []],
            ['stripe_revenue', 'Calculate captured payments CREATED in a date window, minus all refunds recorded against those payments as of this report. This is a payment-cohort metric, NOT period refund cash flow, profit, payouts or net after fees. Separate currencies. Continue with nextCursor until complete; cumulative totals replace earlier totals. Explicit scope required.', [
                'scope' => ['type' => 'string', 'enum' => ['account', 'project']], 'since' => $s, 'until' => $s,
                'timezone' => ['type' => 'string', 'description' => 'IANA timezone; defaults to UTC. Dates are inclusive YYYY-MM-DD; defaults to this month to date.'],
                'metadataKey' => $s, 'metadataValue' => $s,
                'cursor' => ['type' => 'string', 'description' => 'Opaque nextCursor from this same report; keep the same scope and dates.'],
            ], ['scope']],
        ];
        return array_map(fn ($x) => ['type' => 'function', 'function' => ['name' => $x[0], 'description' => $x[1],
            'parameters' => ['type' => 'object', 'properties' => $x[2] ?: new \stdClass, 'required' => $x[3], 'additionalProperties' => false]]], $items);
    }

    public static function validate(string $op, array $a): array
    {
        if ($op !== 'stripe_revenue') return [];
        abort_unless(in_array($a['scope'] ?? null, ['account', 'project'], true), 422, 'Choose account or project scope.');
        $zone = $a['timezone'] ?? 'UTC';
        abort_unless(is_string($zone) && in_array($zone, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true), 422, 'Choose an IANA timezone.');
        $now = now($zone);
        $safe = ['scope' => $a['scope'], 'timezone' => $zone];
        foreach (['since' => $now->copy()->startOfMonth()->toDateString(), 'until' => $now->toDateString()] as $key => $default) {
            $date = $a[$key] ?? $default;
            abort_unless(is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date), 422, 'Use YYYY-MM-DD dates.');
            $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $date, new DateTimeZone($zone));
            abort_unless($parsed && $parsed->format('Y-m-d') === $date, 422, 'Choose a valid calendar date.');
            $safe[$key] = $date;
        }
        abort_unless($safe['since'] <= $safe['until'] && strtotime($safe['until']) - strtotime($safe['since']) <= 366 * 86400,
            422, 'Choose an ordered date window of at most one year.');
        if ($safe['scope'] === 'project') {
            abort_unless(is_string($a['metadataKey'] ?? null) && preg_match('/^[A-Za-z0-9_-]{1,40}$/D', $a['metadataKey'])
                && is_string($a['metadataValue'] ?? null) && strlen($a['metadataValue']) > 0 && strlen($a['metadataValue']) <= 200,
                422, 'Choose the exact project metadata key and value, or confirm that the entire Stripe account belongs to the project.');
            $safe += ['metadataKey' => $a['metadataKey'], 'metadataValue' => $a['metadataValue']];
        }
        if (isset($a['cursor'])) {
            abort_unless(is_string($a['cursor']) && preg_match('/^[a-f0-9]{48}$/D', $a['cursor']), 422, 'That report cursor is invalid.');
            $safe['cursor'] = $a['cursor'];
        }
        return $safe;
    }
}
