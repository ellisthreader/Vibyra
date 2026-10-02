<?php
namespace Tests\Feature\CloudWorkspaces;

use App\Services\CloudWorkspaces\Reservations;
use App\Services\Membership\Licenses\{Issuance, Keys, Redemption};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;

class LicenseRuntimeSettlementTest extends CloudTestCase
{
    public static function boundaries(): array { return [['revoke'], ['expire']]; }

    #[DataProvider('boundaries')]
    public function test_runtime_hold_cannot_restore_invalid_license_tokens(string $end): void
    {
        config(['licenses.enabled' => true, 'membership.enabled' => true, 'membership.free_enabled' => false]);
        DB::table('membership_periods')->where('user_id', $this->user->id)->update(['revoked_at' => now()]);
        DB::table('vibes_grants')->where('user_id', $this->user->id)->update(['remaining' => 0]);
        $license = app(Issuance::class)->create($this->user, ['request_id' => (string) Str::uuid(),
            'label' => 'Runtime settlement', 'tokens' => 300, 'allowance' => 'once', 'duration_months' => null,
            'fixed_ends_at' => now()->addHour(), 'claim_by' => now()->addMinute()]);
        app(Redemption::class)->redeem($this->user, Keys::hash($license['key']));
        $workspace = $this->imported(); $this->start($workspace);
        $hold = DB::table('cloud_reservations')->where('workspace_id', $workspace)->first();
        $this->assertNotNull($hold);
        if ($end === 'revoke') app(Issuance::class)->revoke($license['id'], $this->user);
        else $this->travel(2)->hours();
        app(Wallet::class)->grant($this->user->id, 'purchased-after-runtime', 'topup', 800000);
        DB::transaction(function () use ($hold) {
            app(Wallet::class)->lock($this->user->id);
            app(Reservations::class)->settle($hold, 123, 123);
            app(Reservations::class)->settle($hold, 9999, 9999);
        });
        $this->assertSame(800000, app(Wallet::class)->available($this->user->id));
        $this->assertDatabaseHas('cloud_reservations', ['id' => $hold->id, 'charged' => 123]);
    }
}
