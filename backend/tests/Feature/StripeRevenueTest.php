<?php

namespace Tests\Feature;

use App\Services\ChatConnectors\Stripe\{Money, ReadTools, Revenue};
use App\Services\ChatConnectors\Connectors\StripeConnector;
use Illuminate\Support\Facades\{Cache, Http};
use Tests\TestCase;

class StripeRevenueTest extends TestCase
{
    private function args(array $extra = []): array
    {
        return ReadTools::validate('stripe_revenue', $extra + ['scope' => 'account', 'since' => '2026-03-01', 'until' => '2026-03-31']);
    }

    private function charge(string $id, array $extra = []): array
    {
        return $extra + ['id' => $id, 'paid' => true, 'captured' => true, 'status' => 'succeeded', 'amount' => 10000,
            'amount_captured' => 8000, 'amount_refunded' => 2000, 'currency' => 'gbp', 'livemode' => false, 'metadata' => ['project' => 'Vibyra']];
    }

    public function test_project_totals_use_captured_amounts_refunds_separate_currencies_and_test_labels(): void
    {
        Http::preventStrayRequests();
        Http::fake(['api.stripe.com/*' => Http::response(['data' => [
            $this->charge('one'), $this->charge('other', ['metadata' => ['project' => 'Other']]),
            $this->charge('unknown', ['metadata' => []]), $this->charge('unpaid', ['paid' => false]),
            $this->charge('jpy', ['currency' => 'jpy', 'amount_captured' => 500, 'amount_refunded' => 0]),
        ], 'has_more' => false])]);
        $r = app(Revenue::class)->read($this->args(['scope' => 'project', 'metadataKey' => 'project', 'metadataValue' => 'Vibyra']), 'secret');
        $this->assertTrue($r['complete']);
        $this->assertSame(['gross' => '80.00', 'refunds' => '20.00', 'netCollected' => '60.00'], $r['totals'][0]['formatted']);
        $this->assertSame('500', $r['totals'][1]['formatted']['netCollected']);
        $this->assertSame(1, $r['untaggedPayments']);
        $this->assertSame(1, $r['excludedUnpaidOrUncaptured']);
        $this->assertSame(['test'], $r['modes']);
        $this->assertStringContainsString('/test/', $r['sourceUrl']);
        $this->assertStringNotContainsString('secret', json_encode($r));
    }

    public function test_cursor_is_cumulative_and_bound_to_credentials_and_filters(): void
    {
        Cache::flush(); $seq = Http::sequence();
        for ($i = 1; $i <= 5; $i++) $seq->push(['data' => [$this->charge('ch_'.$i)], 'has_more' => true]);
        $seq->push(['data' => [$this->charge('ch_5'), $this->charge('ch_6')], 'has_more' => false]);
        Http::fake(['api.stripe.com/*' => $seq]);
        $a = $this->args(); $r = app(Revenue::class)->read($a, 'owner');
        $this->assertFalse($r['complete']); $this->assertSame(30000, $r['totals'][0]['netCollected']);
        $next = $a + ['cursor' => $r['nextCursor']];
        $this->assertArrayHasKey('error', app(Revenue::class)->read($next, 'other-owner'));
        $this->assertArrayHasKey('error', app(Revenue::class)->read(array_replace($next, ['until' => '2026-03-30']), 'owner'));
        $done = app(Revenue::class)->read($next, 'owner');
        $this->assertTrue($done['complete']); $this->assertSame(36000, $done['totals'][0]['netCollected']);
        $this->assertSame(6, $done['scannedPayments']);
        Http::assertSent(fn ($r) => ($r['starting_after'] ?? '') === 'ch_5');
    }

    public function test_failures_and_missing_pagination_flag_never_report_complete_zero(): void
    {
        Http::fake(['api.stripe.com/*' => Http::sequence()->push([], 401)->push(['data' => []])]);
        foreach (range(1, 2) as $_) {
            $r = app(Revenue::class)->read($this->args(), 'fixture');
            $this->assertFalse($r['complete']); $this->assertArrayHasKey('error', $r);
        }
    }

    public function test_window_uses_local_midnights_across_dst(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response(['data' => [], 'has_more' => false])]);
        app(Revenue::class)->read($this->args(['timezone' => 'Europe/Malta']), 'fixture');
        Http::assertSent(fn ($r) => $r['created']['gte'] === 1772319600 && $r['created']['lt'] === 1774994400);
    }

    public function test_minor_units_remain_exact_for_large_and_special_currencies(): void
    {
        foreach ([['gbp', 12345, '123.45'], ['jpy', 12345, '12345'], ['kwd', 5120, '5.120'],
            ['isk', 500, '5'], ['ugx', 500, '5'], ['twd', 12345, '123.45'], ['gbp', -1, '-0.01'],
            ['usd', 9007199254740991, '90071992547409.91']] as [$c, $n, $want]) $this->assertSame($want, Money::format($n, $c));
    }

    public function test_ambiguous_projects_and_invalid_dates_are_rejected(): void
    {
        Http::fake();
        foreach ([['scope' => 'project'], ['since' => '2026-02-30'], ['timezone' => 'guess'], ['since' => '2027-01-01']] as $a) {
            try { $this->args($a); $this->fail('Accepted invalid report'); }
            catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) { $this->assertSame(422, $e->getStatusCode()); }
        }
        Http::assertNothingSent();
    }

    public function test_empty_test_account_stays_labelled_and_month_defaults_are_local(): void
    {
        $this->travelTo(\Carbon\Carbon::parse('2026-03-31T23:30:00Z'));
        $a = ReadTools::validate('stripe_revenue', ['scope' => 'account', 'timezone' => 'Europe/Malta']);
        $this->assertSame('2026-04-01', $a['since']); $this->assertSame('2026-04-01', $a['until']);
        Http::fake(['api.stripe.com/*' => Http::response(['data' => [], 'has_more' => false])]);
        $r = app(Revenue::class)->read($a, 'sk_test_fixture');
        $this->assertTrue($r['complete']); $this->assertSame(['test'], $r['modes']);
        $this->assertSame([], $r['totals']);
    }

    public function test_failed_customer_lookup_does_not_create_a_duplicate(): void
    {
        Http::fake(['api.stripe.com/*' => Http::response([], 503)]);
        $r = app(StripeConnector::class)->run('stripe_create_customer', ['email' => 'a@example.com'], 'fixture');
        $this->assertArrayHasKey('error', $r['result']);
        Http::assertNotSent(fn ($r) => $r->method() === 'POST');
    }
}
