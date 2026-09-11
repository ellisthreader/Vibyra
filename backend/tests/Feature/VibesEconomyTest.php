<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Vibes\{Purchases, Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Feature\Support\PinnedVibesTrial;
use Tests\TestCase;

class VibesEconomyTest extends TestCase
{
    use PinnedVibesTrial;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->pinTrial();
    }

    private function account(): User
    {
        $user = User::factory()->create(['plan' => 'free', 'credits_balance' => 50]);
        app(Wallet::class)->ensure($user);
        DB::table('vibes_wallets')->where('user_id', $user->id)->update(['consented_at' => now()]);
        return $user;
    }

    private function quote(User $user, int $max = 10, ?string $chat = null): array
    {
        $chat ??= (string) Str::uuid();
        DB::table('vibes_chats')->insertOrIgnore(['id' => $chat, 'user_id' => $user->id,
            'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
        return ['chatId' => $chat, 'text' => 'Hello', 'model' => 'qwen/qwen3.8-flash', 'trial' => true,
            'max' => $max, 'request' => [], 'expires' => now()->addMinute()->timestamp,
            'revision' => DB::table('vibes_chats')->where('id', $chat)->value('revision')];
    }

    public function test_trial_is_one_time_and_does_not_mutate_legacy_balance(): void
    {
        $user = $this->account();
        app(Wallet::class)->ensure($user);
        $this->assertSame(100, app(Wallet::class)->payload($user->id)['available']);
        $this->assertSame(50, $user->fresh()->credits_balance);
        $this->assertDatabaseCount('vibes_grants', 1);
    }

    public function test_reservation_replay_and_actual_cost_refund(): void
    {
        $u = $this->account(); $s = app(Turns::class); $id = (string) Str::uuid(); $q = $this->quote($u);
        $s->submit($u->id, $id, $q); $s->submit($u->id, $id, $q);
        $this->assertSame(90, app(Wallet::class)->payload($u->id)['available']);
        $s->settle($id, 20000, 'Done'); $s->settle($id, 990000, 'Duplicate');
        $this->assertSame(98, app(Wallet::class)->payload($u->id)['available']);
        $this->assertDatabaseCount('vibes_turns', 1);
        $this->assertSame(2, DB::table('vibes_chats')->value('trial_used'));
    }

    public function test_third_trial_chat_is_rejected_even_when_credit_remains(): void
    {
        $u = $this->account(); $s = app(Turns::class);
        for ($i = 0; $i < 2; $i++) {
            $id = (string) Str::uuid(); $s->submit($u->id, $id, $this->quote($u)); $s->settle($id, 10000, 'Done');
        }
        try { $s->submit($u->id, (string) Str::uuid(), $this->quote($u)); $this->fail('Third chat accepted'); }
        catch (HttpException $e) { $this->assertSame(402, $e->getStatusCode()); }
        $this->assertSame(98, app(Wallet::class)->payload($u->id)['available']);
    }

    public function test_trial_chat_cannot_spend_its_second_chats_allowance(): void
    {
        $u = $this->account(); $s = app(Turns::class); $q = $this->quote($u, 50); $id = (string) Str::uuid();
        $s->submit($u->id, $id, $q); $s->settle($id, 500000, 'Done');
        try { $s->submit($u->id, (string) Str::uuid(), $this->quote($u, 1, $q['chatId'])); $this->fail(); }
        catch (HttpException $e) { $this->assertSame(402, $e->getStatusCode()); }
        $this->assertSame(50, app(Wallet::class)->payload($u->id)['available']);
    }

    public function test_failure_returns_slot_and_zero_is_not_an_estimated_charge(): void
    {
        $u = $this->account(); $s = app(Turns::class); $id = (string) Str::uuid();
        $s->submit($u->id, $id, $this->quote($u)); $s->settle($id, 0, null, 'Unavailable');
        $w = app(Wallet::class)->payload($u->id);
        $this->assertSame(100, $w['available']); $this->assertSame(2, $w['trialChatsRemaining']);
    }

    public function test_quote_overrun_is_absorbed_without_overdraft(): void
    {
        $u = $this->account(); $s = app(Turns::class); $id = (string) Str::uuid();
        $s->submit($u->id, $id, $this->quote($u, 1)); $s->settle($id, 2000000, 'Done');
        $this->assertSame(99, app(Wallet::class)->payload($u->id)['available']);
        $this->assertEquals(2000000, DB::table('vibes_spend_days')->value('spent'));
    }

    public function test_active_turn_and_global_budget_rejection_roll_back_reservations(): void
    {
        $u = $this->account(); $s = app(Turns::class); $id = (string) Str::uuid();
        $s->submit($u->id, $id, $this->quote($u));
        try { $s->submit($u->id, (string) Str::uuid(), $this->quote($u)); $this->fail(); }
        catch (HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
        $s->settle($id, 0, null, 'Stopped'); config(['vibes.daily_micro_usd_limit' => 1]);
        try { $s->submit($u->id, (string) Str::uuid(), $this->quote($u)); $this->fail(); }
        catch (HttpException $e) { $this->assertSame(503, $e->getStatusCode()); }
        $this->assertSame(100, app(Wallet::class)->payload($u->id)['available']);
    }

    public function test_paid_renewals_add_once_and_refunds_do_not_resurrect(): void
    {
        $u = $this->account(); $w = app(Wallet::class)->payload($u->id); $p = app(Purchases::class);
        $t = ['transactionId' => '123', 'originalTransactionId' => '123', 'purchaseDate' => now()->getTimestampMs(),
            'productId' => 'app.vibyra.vibes.starter.monthly', 'appAccountToken' => $w['accountToken'],
            'inAppOwnershipType' => 'PURCHASED', 'expiresDate' => now()->addMonth()->getTimestampMs()];
        $p->apply($u->id, $t); $p->apply($u->id, $t);
        $t['transactionId'] = '124'; $t['purchaseDate'] = $t['expiresDate'];
        $t['expiresDate'] = now()->addMonths(2)->getTimestampMs(); $p->apply($u->id, $t);
        $this->assertSame(800, app(Wallet::class)->payload($u->id)['available']);
        $p->apply($u->id, [...$t, 'revocationDate' => now()->getTimestampMs()]); $p->apply($u->id, $t);
        $this->assertSame(450, app(Wallet::class)->payload($u->id)['available']);
        $this->assertDatabaseCount('vibes_purchases', 2);
    }

    public function test_wrong_account_purchase_and_changed_submission_are_rejected(): void
    {
        $u = $this->account(); $s = app(Turns::class); $id = (string) Str::uuid(); $q = $this->quote($u);
        $s->submit($u->id, $id, $q);
        try { $s->submit($u->id, $id, [...$q, 'text' => 'Changed']); $this->fail(); }
        catch (HttpException $e) { $this->assertSame(409, $e->getStatusCode()); }
        $p = app(Purchases::class);
        $this->expectException(HttpException::class);
        $p->apply($u->id, ['transactionId' => '456', 'originalTransactionId' => '456', 'purchaseDate' => 1,
            'productId' => 'app.vibyra.vibes.topup.500', 'appAccountToken' => (string) Str::uuid()]);
    }
}
