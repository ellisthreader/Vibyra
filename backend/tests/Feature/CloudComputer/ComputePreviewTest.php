<?php
namespace Tests\Feature\CloudComputer;

use App\Services\CloudComputer\{ComputeEconomics, ComputeProfiles};
use App\Services\CloudWorkspaces\{Runtime, Meter};
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

class ComputePreviewTest extends ComputeTestCase
{
    public function test_enabled_feature_requires_an_explicit_quote_and_legacy_flag_off_still_wakes(): void
    {
        $this->wake()->assertStatus(409);
        config(['cloud_preview.enabled' => false]); $this->wake()->assertStatus(202);
    }
    public function test_rates_and_resources_are_snapshotted_with_no_automatic_upgrade(): void
    {
        foreach (['standard' => [2,4096,250000], 'desktop' => [2,8192,350000], 'power' => [4,8192,500000]] as $name => $expected) {
            $q = $this->quote($name); $this->assertSame($expected, [$q['cpus'],$q['memoryMb'],$q['unitsPerHour']]);
        }
        $q=$this->quote('desktop'); $this->postJson('/api/cloud-computer/wake', $this->accept($q))->assertStatus(202);
        $this->assertSame(['cpu_kind'=>'performance','cpus'=>2,'memory_mb'=>8192],app(ComputeProfiles::class)->guest($this->row()));
    }
    public function test_duplicate_accept_is_idempotent_but_another_request_cannot_reuse_it(): void
    {
        $q=$this->quote(); $d=$this->accept($q);
        $this->postJson('/api/cloud-computer/wake',$d)->assertStatus(202);
        $this->postJson('/api/cloud-computer/wake',$d)->assertStatus(202);
        $this->assertSame(1,DB::table('cloud_reservations')->count());
        $this->postJson('/api/cloud-computer/wake',$this->accept($q))->assertStatus(409);
    }
    public function test_expired_or_repriced_quote_cannot_spend(): void
    {
        $q=$this->quote(); $this->travel(121)->seconds();
        $this->postJson('/api/cloud-computer/wake',$this->accept($q))->assertStatus(409);
        $q=$this->quote(); config(['cloud_preview.profiles.standard.units_per_hour'=>260000]);
        $this->postJson('/api/cloud-computer/wake',$this->accept($q))->assertStatus(409);
        $this->assertSame(0,DB::table('cloud_reservations')->count());
    }
    public function test_wrong_device_and_session_cannot_accept_the_quote(): void
    {
        $q=$this->quote(); $d=$this->accept($q); $d['deviceId']='another-device';
        $this->postJson('/api/cloud-computer/wake',$d)->assertStatus(403);
        $d['deviceId']=$this->device->uuid; DB::table('cloud_compute_quotes')->where('id',$q['id'])->update(['session_id'=>$this->session->id+1]);
        $this->postJson('/api/cloud-computer/wake',$d)->assertStatus(403);
    }
    public function test_failed_all_in_margin_and_stale_inputs_disable_the_profile(): void
    {
        config(['cloud_preview.economics.fixed_micro_month'=>20000000]);
        $this->postJson('/api/cloud-computer/compute/quote',['profile'=>'standard','deviceId'=>$this->device->uuid,'budgetUnits'=>100000])->assertStatus(503);
        config(['cloud_preview.economics.fixed_micro_month'=>3200000,'cloud_preview.economics.reviewed_at'=>now()->subDays(8)->toDateTimeString()]);
        $this->assertFalse(app(ComputeEconomics::class)->audit(config('cloud_preview.profiles.standard'))['passed']);
    }
    public function test_annual_and_31_day_billing_cover_the_rolling_start_limit_boundary(): void
    {
        config(['vibes.plans.pro_v2.cloudHours'=>0]);
        $offers=app(ComputeEconomics::class)->audit(config('cloud_preview.profiles.standard'))['offers'];
        $this->assertSame(6860000,$offers['pro_monthly']['fullRedemptionCostMicroUsd']);
        $this->assertSame(82320000,$offers['pro_annual']['fullRedemptionCostMicroUsd']);
    }
    public function test_provider_hold_uses_dollars_and_lease_is_clipped_to_a_small_budget(): void
    {
        $q=$this->quote('standard',1000);
        $this->postJson('/api/cloud-computer/wake',$this->accept($q))->assertStatus(202);
        $r=DB::table('cloud_reservations')->first();
        $this->assertSame(1000,(int)$r->reserved); $this->assertSame(520,(int)$r->spend_held);
        DB::table('cloud_workspaces')->where('id',$this->cid)->update(['machine_id'=>'machine']);
        $w=$this->row(); $runtime=app(Runtime::class);
        $boot=$runtime->bootstrap($w->id,Crypt::decryptString($w->bootstrap_secret),'machine',$w->generation);
        $runtime->heartbeat($runtime->authenticate($w->id,$boot['token']),true);
        $this->assertEqualsWithDelta(14,strtotime($this->row()->lease_until)-now()->timestamp,1);
        $this->travel(60)->seconds(); app(Meter::class)->settle($this->row(),true);
        $r=DB::table('cloud_reservations')->first();
        $this->assertSame(14,(int)$r->billed_seconds); $this->assertLessThanOrEqual(1000,(int)$r->charged);
    }
    public function test_usage_is_account_owned_and_exposes_integer_units_without_double_charging(): void
    {
        $this->postJson('/api/cloud-computer/wake',$this->accept($this->quote()))->assertStatus(202);
        $this->getJson('/api/cloud-computer/compute/usage')->assertOk()->assertJsonPath('current.unitsPerHour','250000')
            ->assertJsonPath('current.sessionBudgetUnits','100000')->assertJsonPath('current.unitScale',10000);
        $this->assertSame(1,DB::table('cloud_reservations')->count());
    }
    public function test_foreground_lease_requires_a_live_ready_generation_and_approved_device(): void
    {
        $this->postJson('/api/cloud-computer/preview/activity',['workspaceId'=>$this->cid,'generation'=>1,
            'deviceId'=>$this->device->uuid,'visible'=>true])->assertStatus(409);
    }
    public function test_native_capability_cannot_be_silently_added_after_quote_acceptance(): void
    {
        config(['cloud_preview.native_enabled'=>false]);
        $this->postJson('/api/cloud-computer/wake',$this->accept($this->quote()))->assertStatus(202);
        config(['cloud_preview.native_enabled'=>true]);
        DB::table('cloud_workspaces')->where('id',$this->cid)->update(['machine_id'=>'machine']);
        $w=$this->row(); $boot=app(Runtime::class)->bootstrap($w->id,Crypt::decryptString($w->bootstrap_secret),'machine',$w->generation);
        $this->assertFalse($boot['preview']['native']);
        $this->getJson('/api/cloud-computer/compute/usage')->assertOk()->assertJsonPath('current.nativeAvailable',false);
    }
    public function test_native_kill_switch_stops_renewal_of_an_accepted_native_session(): void
    {
        config(['cloud_preview.native_enabled'=>true]);
        $this->postJson('/api/cloud-computer/wake',$this->accept($this->quote()))->assertStatus(202);
        DB::table('cloud_workspaces')->where('id',$this->cid)->update(['machine_id'=>'machine']);
        $w=$this->row(); $runtime=app(Runtime::class);
        $boot=$runtime->bootstrap($w->id,Crypt::decryptString($w->bootstrap_secret),'machine',$w->generation);
        $runtime->heartbeat($runtime->authenticate($w->id,$boot['token']),true);
        config(['cloud_preview.native_enabled'=>false]); $this->travel(5)->seconds();
        $reply=$runtime->heartbeat($runtime->authenticate($w->id,$boot['token']),true);
        $this->assertTrue($reply['stop']); $this->assertSame('stopping',$reply['state']);
    }
}
