<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use VibyraSandbox\{Assertions, Safety};

require_once __DIR__.'/../../scripts/stripe-sandbox/Safety.php';
require_once __DIR__.'/../../scripts/stripe-sandbox/Assertions.php';

final class StripeSandboxHarnessTest extends TestCase
{
    private string $root;
    private array $env;

    protected function setUp(): void
    {
        $this->root = realpath(sys_get_temp_dir()).'/vibyra-stripe-sandbox-'.bin2hex(random_bytes(6));
        mkdir($this->root, 0700); touch($this->root.'/billing.sqlite');
        $this->env = ['VIBYRA_STRIPE_SANDBOX' => '1', 'APP_ENV' => 'local', 'DB_CONNECTION' => 'sqlite',
            'DB_DATABASE' => $this->root.'/billing.sqlite', 'DB_URL' => '',
            'STRIPE_SECRET_KEY' => 'rk_test_fixture', 'STRIPE_SANDBOX_OPERATOR_KEY' => 'sk_test_fixture',
            'MEMBERSHIP_STRIPE_ENVIRONMENT' => 'test'];
    }

    protected function tearDown(): void
    {
        foreach (glob($this->root.'/*') as $path) unlink($path);
        rmdir($this->root);
    }

    public function test_guard_accepts_only_explicit_local_disposable_test_environment(): void
    {
        $this->assertSame($this->root, Safety::check($this->env));
        foreach ([['APP_ENV' => 'production'], ['DB_CONNECTION' => 'pgsql'], ['DB_URL' => 'postgres://example'],
            ['STRIPE_SECRET_KEY' => 'rk_live_fixture'], ['STRIPE_SANDBOX_OPERATOR_KEY' => 'sk_live_fixture'],
            ['MEMBERSHIP_STRIPE_ENVIRONMENT' => 'live'], ['VIBYRA_STRIPE_SANDBOX' => '0'],
            ['DB_DATABASE' => ':memory:'], ['DB_DATABASE' => '/tmp/database.sqlite']] as $change) {
            try { Safety::check(array_replace($this->env, $change)); $this->fail('Unsafe environment accepted.'); }
            catch (\RuntimeException $e) { $this->assertStringStartsWith('Refused:', $e->getMessage()); }
        }
    }

    public function test_guard_rejects_symlinked_database(): void
    {
        rename($this->root.'/billing.sqlite', $this->root.'/other.sqlite');
        symlink($this->root.'/other.sqlite', $this->root.'/billing.sqlite');
        $this->expectException(\RuntimeException::class); Safety::check($this->env);
    }

    public function test_claimable_key_requires_separate_opt_in_and_still_rejects_live_key(): void
    {
        $env = array_replace($this->env, ['STRIPE_SECRET_KEY' => 'rkcs_fixture']);
        try { Safety::check($env); $this->fail('Claimable key accepted without explicit opt-in.'); }
        catch (\RuntimeException) { $this->addToAssertionCount(1); }
        $env['STRIPE_SANDBOX_CLAIMABLE'] = '1';
        $this->assertSame($this->root, Safety::check($env));
        $env['STRIPE_SECRET_KEY'] = 'rk_live_fixture';
        $this->expectException(\RuntimeException::class); Safety::check($env);
    }

    private function paid(): array
    {
        return ['periods' => [['cancelAtEnd' => false, 'refundedMinor' => 0, 'revokedUnits' => 0,
            'disputed' => false, 'revoked' => false, 'endsAt' => null]], 'offerUnits' => 800000,
            'offerPence' => 499, 'grantUnits' => 800000, 'remainingUnits' => 800000,
            'failedEvents' => 0, 'testOnly' => true, 'subscription' => false, 'tier' => 'free', 'asOf' => time()];
    }

    public function test_duplicate_grants_and_failed_or_live_events_cannot_pass_paid_acceptance(): void
    {
        $s = $this->paid(); $this->assertTrue(Assertions::verify($s, 'paid'));
        foreach ([['grantUnits' => 1600000], ['failedEvents' => 1], ['testOnly' => false], ['periods' => []]] as $bad) {
            $this->assertFalse(Assertions::verify(array_replace($s, $bad), 'paid'));
        }
        $this->assertFalse(Assertions::verify($s, 'misspelled-phase'));
    }

    public function test_refunds_require_exact_cumulative_reversal_of_only_purchased_units(): void
    {
        $s = $this->paid(); $s['periods'][0]['refundedMinor'] = 100;
        $s['periods'][0]['revokedUnits'] = intdiv(800000 * 100, 499);
        $s['remainingUnits'] -= $s['periods'][0]['revokedUnits'];
        $this->assertTrue(Assertions::verify($s, 'partial-refund'));
        ++$s['remainingUnits']; $this->assertFalse(Assertions::verify($s, 'partial-refund'));
        $s['periods'][0]['refundedMinor'] = 499; $s['periods'][0]['revokedUnits'] = 800000; $s['remainingUnits'] = 0;
        $this->assertTrue(Assertions::verify($s, 'full-refund'));
    }

    public function test_paid_subscription_tokens_do_not_prove_pro_entitlement(): void
    {
        $s = $this->paid(); $s['subscription'] = true;
        $this->assertFalse(Assertions::verify($s, 'paid'));
        $s['tier'] = 'pro'; $this->assertTrue(Assertions::verify($s, 'paid'));
        $s['periods'][] = $s['periods'][0]; $s['grantUnits'] *= 2; $s['remainingUnits'] *= 2;
        $this->assertTrue(Assertions::verify($s, 'renewed'));
        $s['tier'] = 'free'; $this->assertFalse(Assertions::verify($s, 'renewed'));
    }

    public function test_dispute_restriction_and_loss_need_provider_state_and_entitlement_effect(): void
    {
        $s = $this->paid(); $s['subscription'] = true; $s['tier'] = 'pro'; $s['periods'][0]['disputed'] = true;
        $this->assertFalse(Assertions::verify($s, 'disputed'));
        $s['tier'] = 'free'; $this->assertTrue(Assertions::verify($s, 'disputed'));
        $s['periods'][0]['revoked'] = true; $s['remainingUnits'] = 0;
        $this->assertTrue(Assertions::verify($s, 'lost'));
        $this->assertFalse(Assertions::verify($s, 'won'));
    }

    public function test_plain_payment_cannot_prove_a_won_dispute_or_failed_renewal(): void
    {
        $s = $this->paid(); $this->assertFalse(Assertions::verify($s, 'won'));
        $s['wonEvidence'] = true; $this->assertTrue(Assertions::verify($s, 'won'));
        $s['subscription'] = true; $s['periods'][0]['endsAt'] = gmdate('Y-m-d H:i:s', time() - 100);
        $this->assertFalse(Assertions::verify($s, 'failed-renewal'));
        $s['failureEvidence'] = true;
        $this->assertTrue(Assertions::verify($s, 'failed-renewal'));
        $s['periods'][] = $s['periods'][0]; $s['grantUnits'] *= 2;
        $this->assertFalse(Assertions::verify($s, 'failed-renewal'));
    }

    public function test_won_dispute_must_restore_funding_admission_not_only_balance(): void
    {
        $s = $this->paid(); $s['wonEvidence'] = true; $s['fundingBlocked'] = true;
        $this->assertFalse(Assertions::verify($s, 'won'));
        $s['fundingBlocked'] = false; $this->assertTrue(Assertions::verify($s, 'won'));
    }
}
