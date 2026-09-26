<?php

namespace App\Services\ChatConnectors\Stripe;

use DateTimeImmutable;
use DateTimeZone;
use Illuminate\Support\Facades\Cache;

/** Computes in integer API units, never asks the model to total individual payments. */
final class Revenue
{
    public function __construct(private readonly Client $client) {}

    public function read(array $a, string $token): array
    {
        $cursor = $a['cursor'] ?? null; unset($a['cursor']);
        $owner = hash('sha256', $token); $signature = hash('sha256', json_encode($a));
        $zone = new DateTimeZone($a['timezone']);
        $state = $cursor ? Cache::get('stripe-report:'.$owner.':'.$cursor) : [
            'signature' => $signature, 'since' => (new DateTimeImmutable($a['since'], $zone))->getTimestamp(),
            'until' => min(time() + 1, (new DateTimeImmutable($a['until'], $zone))->modify('+1 day')->getTimestamp()),
            'totals' => [], 'seen' => [], 'scanned' => 0, 'matched' => 0, 'excluded' => 0, 'untagged' => 0,
            'last' => null, 'modes' => str_starts_with($token, 'sk_test_') ? ['test' => true] : [], 'pages' => 0, 'startedAt' => gmdate('c'),
        ];
        if (!is_array($state) || ($state['signature'] ?? null) !== $signature)
            return ['error' => 'This report expired, belongs to another connection, or its filters changed. Start a new report.'];
        $more = true; $error = null;
        for ($page = 0; $page < 5 && $state['pages'] < 50; $page++) {
            $q = ['limit' => 100, 'created' => ['gte' => $state['since'], 'lt' => $state['until']]];
            if ($state['last']) $q['starting_after'] = $state['last'];
            $r = $this->client->get($token, '/charges', $q);
            if (isset($r['error'])) { $error = $r['error']; break; }
            $rows = $r['data']['data'] ?? null;
            if (!is_array($rows) || !is_bool($r['data']['has_more'] ?? null)) { $error = 'Stripe returned an incomplete payments page.'; break; }
            $previous = $state['last'];
            foreach ($rows as $charge) {
                $id = $charge['id'] ?? null;
                if (!is_string($id)) { $error = 'A Stripe payment was missing its identifier.'; break; }
                $state['last'] = $id;
                if (isset($state['seen'][$id])) continue;
                $state['seen'][$id] = true; $state['scanned']++;
                if (isset($charge['livemode'])) $state['modes'][$charge['livemode'] ? 'live' : 'test'] = true;
                if ($a['scope'] === 'project') {
                    $value = $charge['metadata'][$a['metadataKey']] ?? null;
                    if ($value === null) $state['untagged']++;
                    if ($value !== $a['metadataValue']) continue;
                }
                $state['matched']++;
                if (!($charge['paid'] ?? false) || !($charge['captured'] ?? false) || ($charge['status'] ?? '') !== 'succeeded') {
                    $state['excluded']++; continue;
                }
                $currency = strtolower((string) ($charge['currency'] ?? ''));
                $gross = $charge['amount_captured'] ?? $charge['amount'] ?? null; $refunded = $charge['amount_refunded'] ?? 0;
                if (!preg_match('/^[a-z]{3}$/D', $currency) || !is_int($gross) || !is_int($refunded) || $gross < 0 || $refunded < 0 || $refunded > $gross) {
                    $error = 'A payment had unsupported amounts; totals are incomplete.'; break;
                }
                $state['totals'][$currency] ??= ['gross' => 0, 'refunds' => 0, 'netCollected' => 0, 'payments' => 0];
                $state['totals'][$currency]['gross'] += $gross;
                $state['totals'][$currency]['refunds'] += $refunded;
                $state['totals'][$currency]['netCollected'] += $gross - $refunded;
                $state['totals'][$currency]['payments']++;
            }
            $state['pages']++;
            $more = (bool) ($r['data']['has_more'] ?? false);
            if ($error || !$more) break;
            if (!$rows || $state['last'] === $previous) { $error = 'Stripe pagination did not advance.'; break; }
        }
        $next = null;
        if ($more && !$error && $state['pages'] < 50) {
            $next = bin2hex(random_bytes(24));
            Cache::put('stripe-report:'.$owner.':'.$next, $state, now()->addMinutes(15));
        }
        $totals = [];
        foreach ($state['totals'] as $currency => $values) {
            $formatted = [];
            foreach (['gross', 'refunds', 'netCollected'] as $key) $formatted[$key] = Money::format($values[$key], $currency);
            $totals[] = ['currency' => strtoupper($currency), ...$values, 'formatted' => $formatted];
        }
        return ['scope' => $a, 'totals' => $totals, 'complete' => !$more && !$error, ...($error ? ['error' => $error] : []),
            'nextCursor' => $next, 'cumulative' => true, 'scannedPayments' => $state['scanned'], 'matchedPayments' => $state['matched'],
            'excludedUnpaidOrUncaptured' => $state['excluded'], 'untaggedPayments' => $state['untagged'],
            'modes' => array_keys($state['modes']), 'startedAt' => $state['startedAt'], 'readAt' => gmdate('c'),
            'sourceUrl' => 'https://dashboard.stripe.com/'.(array_keys($state['modes']) === ['test'] ? 'test/' : '').'payments',
            'definition' => 'Captured successful payments created in the selected date window, minus ALL recorded refunds against those payments at read time. Excludes refunds against older payments, fees, disputes, taxes, operating costs and payouts. Not profit or period cash flow. Pending availability is not excluded. Separate currencies; never sum them. Reads are not an atomic accounting snapshot.',
            'coverage' => 'Up to 500 payments per call and 5000 per report. Continue nextCursor with identical filters; cumulative totals replace prior totals. If incomplete, narrow the window or label the subtotal. Untagged payments cannot be attributed to a project.'];
    }
}
