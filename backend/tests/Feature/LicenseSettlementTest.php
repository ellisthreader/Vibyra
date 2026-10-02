<?php
namespace Tests\Feature;

use App\Services\Assistant\Budget;
use App\Services\Membership\Licenses\{Issuance, Keys, Redemption};
use App\Services\Vibes\{Turns, Wallet};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class LicenseSettlementTest extends TestCase
{
    use RefreshDatabase, AssistantFixture;

    public static function boundaries(): array
    {
        return [['assistant', 'revoke'], ['assistant', 'expire'], ['vibes', 'revoke'], ['vibes', 'expire']];
    }

    #[DataProvider('boundaries')]
    public function test_inflight_work_settles_once_without_restoring_invalid_license_tokens(string $surface, string $end): void
    {
        config(['licenses.enabled' => true, 'membership.enabled' => true]);
        DB::table('vibes_grants')->where('user_id', $this->user->id)->update(['remaining' => 0]);
        $license = app(Issuance::class)->create($this->user, ['request_id' => (string) Str::uuid(),
            'label' => 'Settlement', 'tokens' => 300, 'allowance' => 'once', 'duration_months' => null,
            'fixed_ends_at' => now()->addHour(), 'claim_by' => now()->addMinute()]);
        app(Redemption::class)->redeem($this->user, Keys::hash($license['key']));
        if ($surface === 'assistant') {
            $id = app(Budget::class)->reserve($this->user->id, (string) Str::uuid(), 'chat', 10000);
        } else {
            DB::table('vibes_wallets')->where('user_id', $this->user->id)->update(['consented_at' => now()]);
            $chat = (string) Str::uuid();
            DB::table('vibes_chats')->insert(['id' => $chat, 'user_id' => $this->user->id, 'title' => 'Test', 'created_at' => now(), 'updated_at' => now()]);
            $id = (string) Str::uuid();
            app(Turns::class)->submit($this->user->id, $id, ['unitScale' => 10000, 'chatId' => $chat,
                'model' => 'test', 'text' => 'Hi', 'request' => [], 'expires' => now()->addMinute()->timestamp,
                'revision' => 0, 'trial' => true, 'max' => 10000]);
        }
        if ($end === 'revoke') app(Issuance::class)->revoke($license['id'], $this->user);
        else $this->travel(2)->hours();
        // Purchased tokens survive both boundaries; no unused license hold returns.
        app(Wallet::class)->grant($this->user->id, 'purchased-after-hold', 'topup', 800000);
        foreach ([123, 9999] as $cost) {
            if ($surface === 'assistant') app(Budget::class)->finish($id, $cost);
            else app(Turns::class)->settle($id, $cost, 'Done');
        }
        $this->assertSame(800000, $this->funds());
        $this->assertEquals(0, DB::table('vibes_spend_days')->sum('held'));
        $this->assertEquals(123, DB::table('vibes_spend_days')->sum('spent'));
        $this->assertDatabaseHas($surface === 'assistant' ? 'assistant_requests' : 'vibes_turns',
            ['id' => $id, $surface === 'assistant' ? 'charged_units' : 'charged' => 123]);
    }
}
