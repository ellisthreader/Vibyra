<?php

namespace Tests\Feature;

use App\Services\Vibes\Wallet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class OwnerAccountCreditsTest extends TestCase
{
    use RefreshDatabase, Concerns\OwnerAccountFixtures;
    protected function setUp(): void { parent::setUp(); $this->accounts(); $this->unlockOwner(); }

    public function test_legacy_grants_are_exact_and_replay_safe(): void
    {
        $terms = $this->action(); $url = $this->accountUrl().'/actions';
        $this->postJson($url, $terms)->assertOk()->assertJsonPath('receipt.amount', 25);
        $this->postJson($url, $terms)->assertOk()->assertJsonPath('receipt.request_id', $terms['request_id']);
        $this->assertEquals(45, $this->target->fresh()->credits_balance);
        $this->assertDatabaseCount('owner_account_actions', 1);
        $this->assertDatabaseCount('credit_ledger', 1);
        $this->postJson($url, [...$terms, 'amount' => 50])->assertConflict();
        $this->postJson($url, $this->action())->assertConflict();
        $this->getJson($url.'/'.$terms['request_id'])->assertOk()->assertJsonPath('receipt.user_id', $this->target->id);
    }

    public function test_modern_tokens_have_correct_scale_and_do_not_change_membership_or_legacy_credits(): void
    {
        app(Wallet::class)->ensure($this->target, 0);
        DB::table('vibes_wallets')->where('user_id', $this->target->id)->update(['billing_version' => 2]);
        $terms = $this->action(['balance' => 'tokens', 'amount' => 123]);
        $this->postJson($this->accountUrl().'/actions', $terms)->assertOk()->assertJsonPath('receipt.units', '1230000');
        $this->postJson($this->accountUrl().'/actions', $terms)->assertOk();
        $this->assertDatabaseHas('vibes_grants', ['reference' => 'owner-grant:'.$terms['request_id'], 'kind' => 'owner', 'amount' => 1230000]);
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
        $this->assertDatabaseCount('membership_periods', 0);
        $this->getJson($this->accountUrl())->assertJsonPath('balances.0.available', '1230000')->assertJsonPath('balances.0.scale', 10000);
        $this->postJson($this->accountUrl().'/actions', $this->action(['revision' => 1]))->assertConflict();
    }

    public function test_legacy_vibes_and_credits_are_independent_and_read_excludes_expired_grants(): void
    {
        app(Wallet::class)->ensure($this->target, 0);
        $terms = $this->action(['balance' => 'vibes', 'amount' => 7]);
        $this->postJson($this->accountUrl().'/actions', $terms)->assertOk()->assertJsonPath('receipt.scale', 1);
        app(Wallet::class)->grant($this->target->id, 'expired-fixture', 'owner', 90);
        DB::table('vibes_grants')->where('reference', 'expired-fixture')->update(['expires_at' => now()->subDay()]);
        $this->getJson($this->accountUrl())->assertJsonPath('balances.0.available', '7')->assertJsonPath('balances.1.available', '20');
        $this->assertEquals(90, DB::table('vibes_grants')->where('reference', 'expired-fixture')->value('remaining'));
    }

    public function test_invalid_amounts_and_uninitialized_modern_accounts_cannot_receive_legacy_credits(): void
    {
        foreach ([0, -1, 0.5, 10001] as $amount) $this->postJson($this->accountUrl().'/actions', $this->action(['amount' => $amount]))->assertUnprocessable();
        config(['membership.enabled' => true, 'membership.new_accounts_from' => now()->subMinute()->toIso8601String()]);
        $this->postJson($this->accountUrl().'/actions', $this->action())->assertConflict();
        $this->assertDatabaseCount('owner_account_actions', 0);
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
    }

    public function test_cancel_fences_a_late_submission_and_preserves_an_already_applied_action(): void
    {
        $terms = $this->action(); $url = $this->accountUrl().'/actions';
        $this->postJson($url.'/'.$terms['request_id'].'/cancel')->assertOk()->assertJsonPath('receipt.action', 'cancelled');
        $this->postJson($url, $terms)->assertConflict();
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
        $applied = $this->action();
        $this->postJson($url, $applied)->assertOk();
        $this->postJson($url.'/'.$applied['request_id'].'/cancel')->assertOk()->assertJsonPath('receipt.action', 'credit');
        $this->assertEquals(45, $this->target->fresh()->credits_balance);
    }

    public function test_audit_failure_rolls_back_the_credit_and_revision(): void
    {
        DB::statement("CREATE TRIGGER reject_owner_audit BEFORE INSERT ON owner_account_actions BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END");
        $this->postJson($this->accountUrl().'/actions', $this->action())->assertStatus(500);
        $this->assertEquals(20, $this->target->fresh()->credits_balance);
        $this->assertEquals(0, $this->target->fresh()->owner_action_revision);
        $this->assertDatabaseCount('credit_ledger', 0);
    }
}
