<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{PreviewTrial, PreviewCosts};
use App\Services\CloudWorkspaces\{Runtime, Meter};
use App\Services\Vibes\{Wallet, DeviceCheck};
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

class ComputeTrialTest extends ComputerTestCase
{
    use \Tests\Support\RemoteSecurityFixture;
    protected function setUp(): void
    {
        parent::setUp();
        config(['cloud_preview.enabled'=>true,'cloud_preview.trial_enabled'=>true,'cloud_preview.economics_verified'=>true,
            'cloud_preview.egress_micro_per_gib'=>20000,
            'cloud_preview.startup_exposure_micro'=>20000,
            'cloud_preview.economics'=>['net_micro_per_offer'=>['pro_monthly'=>13993000,'pro_annual'=>139993000,'tokens_80'=>3493000,'tokens_200'=>6993000,'tokens_450'=>13993000], 'usd_per_gbp'=>1.2,'vat_fraction'=>0.2,'fee_fraction'=>0.3,
                'fixed_micro_month'=>3200000,'ai_micro_per_token'=>10000,'reviewed_at'=>now()->toDateTimeString()],
            'cloud_preview.profiles.standard.provider_micro_per_hour'=>130000]);
        DB::table('membership_periods')->where('user_id',$this->user->id)->update(['revoked_at'=>now()]);
        $device=$this->mock(DeviceCheck::class); $device->shouldReceive('claimCloudTrial')->once()->andReturn(true);
        app(PreviewTrial::class)->claim($this->user->id,str_repeat('a',32));
        $this->createComputer();
    }
    private function startTrial(): string
    {
        $q=$this->postJson('/api/cloud-computer/compute/quote',['profile'=>'standard','deviceId'=>$this->device->uuid,'budgetUnits'=>100000])->assertOk()->json('quote');
        $this->assertTrue($q['trial']); $this->assertSame(600,$q['deadlineSeconds']);
        $this->postJson('/api/cloud-computer/wake',['acceptTerms'=>true,'quoteId'=>$q['id'],'deviceId'=>$this->device->uuid,'requestId'=>(string)Str::uuid()])->assertStatus(202);
        DB::table('cloud_workspaces')->where('id',$this->cid)->update(['machine_id'=>'machine']);
        $w=$this->row(); $runtime=app(Runtime::class);
        $boot=$runtime->bootstrap($w->id,Crypt::decryptString($w->bootstrap_secret),'machine',$w->generation);
        $runtime->heartbeat($runtime->authenticate($w->id,$boot['token']),true); return $boot['token'];
    }
    public function test_free_seconds_are_separate_from_the_wallet_and_cannot_be_spent_twice(): void
    {
        $before=app(Wallet::class)->available($this->user->id); $this->startTrial();
        $this->travel(15)->seconds(); app(Meter::class)->settle($this->row()); app(Meter::class)->settle($this->row());
        $this->assertSame(585,app(PreviewTrial::class)->remaining($this->user->id));
        $this->assertSame($before,app(Wallet::class)->available($this->user->id));
        $this->assertSame(0,(int)DB::table('cloud_reservations')->sum('charged'));
        $this->assertGreaterThan(0,(int)DB::table('cloud_reservations')->sum('actual_micro_usd'));
    }
    public function test_power_is_refused_and_exhaustion_requires_pro_even_with_paid_wallet_grants(): void
    {
        $this->postJson('/api/cloud-computer/compute/quote',['profile'=>'power','deviceId'=>$this->device->uuid,'budgetUnits'=>100000])->assertStatus(403);
        DB::table('cloud_preview_trials')->where('user_id',$this->user->id)->update(['used_seconds'=>600]);
        $this->postJson('/api/cloud-computer/compute/quote',['profile'=>'standard','deviceId'=>$this->device->uuid,'budgetUnits'=>100000])->assertStatus(402);
        $this->assertFalse(app(PreviewTrial::class)->canClaim($this->user->id));
    }
    public function test_reinstall_or_repeat_account_claim_does_not_reset_seconds(): void
    {
        DB::table('cloud_preview_trials')->where('user_id',$this->user->id)->update(['used_seconds'=>500]);
        $r=app(PreviewTrial::class)->claim($this->user->id,str_repeat('b',32));
        $this->assertSame(100,$r['remainingSeconds']); $this->assertSame(1,DB::table('cloud_preview_trials')->count());
    }
    public function test_all_in_trial_storage_capacity_refuses_without_spending_wallet_or_starting(): void
    {
        config(['cloud_preview.trial_month_micro_limit'=>1]);
        $q=$this->postJson('/api/cloud-computer/compute/quote',['profile'=>'standard','deviceId'=>$this->device->uuid,'budgetUnits'=>100000])->assertOk()->json('quote');
        $this->postJson('/api/cloud-computer/wake',['acceptTerms'=>true,'quoteId'=>$q['id'],'deviceId'=>$this->device->uuid,'requestId'=>(string)Str::uuid()])->assertStatus(503);
        $this->assertSame('stopped',$this->row()->state); $this->assertSame(0,DB::table('cloud_reservations')->count());
    }
    public function test_free_trial_connects_only_its_running_cloud_and_relay_renewal_stops_at_exhaustion(): void
    {
        config(['remote.require_plan'=>true]);
        $token=$this->startTrial(); $this->registerHost($token)->assertOk();
        $host=\App\Models\RemoteHost::findOrFail($this->row()->remote_host_id);
        $host->forceFill(['online_until'=>now()->addMinute()])->save();
        $authorization=$this->secureRemoteRequest($this->user,$this->session,$host);
        $grant=$this->postJson('/api/remote/hosts/'.$host->host_id.'/connect',$authorization)->assertOk()->json();
        $relay=app(\App\Services\Remote\RelayAuthorization::class);
        $this->assertTrue($relay->allows($grant['token'],false));
        $this->assertTrue($relay->allows($grant['token'],true));
        $this->postJson('/api/remote/hosts/'.$this->device->host->host_id.'/connect',[])->assertForbidden();
        DB::table('cloud_preview_trials')->where('user_id',$this->user->id)->update(['used_seconds'=>600]);
        $this->assertFalse($relay->allows($grant['token'],true));
        $this->postJson('/api/remote/hosts/'.$host->host_id.'/connect',[])->assertForbidden();
    }
}
