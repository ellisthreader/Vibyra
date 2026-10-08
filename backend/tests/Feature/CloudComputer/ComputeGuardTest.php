<?php
namespace Tests\Feature\CloudComputer;
use App\Models\RemoteSession;
use App\Services\CloudComputer\{PreviewEgress, ComputeUsage};
use App\Services\CloudWorkspaces\{Budgets, Runtime};
use App\Services\Vibes\Wallet;
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;
class ComputeGuardTest extends ComputeTestCase
{
    private function readyCompute(int $budget = 100000): string
    {
        $this->postJson('/api/cloud-computer/wake',$this->accept($this->quote('standard',$budget)))->assertStatus(202);
        DB::table('cloud_workspaces')->where('id',$this->cid)->update(['machine_id'=>'machine']);
        $w=$this->row(); $rt=app(Runtime::class);
        $b=$rt->bootstrap($w->id,Crypt::decryptString($w->bootstrap_secret),'machine',$w->generation);
        $rt->heartbeat($rt->authenticate($w->id,$b['token']),true); return $b['token'];
    }
    public function test_renewed_lease_never_exceeds_its_remaining_funded_seconds(): void
    {
        $token=$this->readyCompute(1000); $this->travel(10)->seconds();
        app(Runtime::class)->heartbeat(app(Runtime::class)->authenticate($this->cid,$token),true);
        $this->assertLessThanOrEqual(4,strtotime($this->row()->lease_until)-now()->timestamp);
        $this->travel(10)->seconds();
        app(Runtime::class)->heartbeat(app(Runtime::class)->authenticate($this->cid,$token),true);
        $this->assertSame('stopping',$this->row()->state);
        $this->assertLessThanOrEqual(1000,app(Budgets::class)->committed($this->row()));
    }
    public function test_signed_network_windows_are_reserved_replay_safe_and_fail_on_counter_reset(): void
    {
        $this->readyCompute(); config(['cloud_preview.account_egress_bytes_day'=>3000,'cloud_preview.global_egress_bytes_day'=>3000]);
        // The readiness window was already held. Shrinking a policy must not mint another window.
        $w=$this->row(); $n=DB::table('cloud_egress_counters')->first();
        $counter=(int)$n->authorized_bytes;
        $run=fn($bytes)=>DB::transaction(function () use ($w,$bytes) {app(Wallet::class)->lock($w->user_id); return app(PreviewEgress::class)->record($w,$bytes);});
        $this->assertSame(0,$run($counter)['bytes']); $before=DB::table('cloud_provider_exposures')->count();
        $this->assertSame(0,$run($counter)['bytes']); $this->assertSame($before,DB::table('cloud_provider_exposures')->count());
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class); $run($counter-1);
    }
    public function test_remaining_network_allowance_moves_across_days_and_close_absorbs_it_once(): void
    {
        $this->readyCompute(); $w=$this->row(); $day=now()->toDateString();
        $held=(int)DB::table('cloud_egress_days')->where('day',$day)->value('held'); $this->assertGreaterThan(0,$held);
        $this->travel(1)->days();
        DB::transaction(fn()=>app(PreviewEgress::class)->record($w,100));
        $this->assertSame(0,(int)DB::table('cloud_egress_days')->where('day',$day)->value('held'));
        DB::transaction(fn()=>app(PreviewEgress::class)->close($w)); DB::transaction(fn()=>app(PreviewEgress::class)->close($w));
        $this->assertSame(0,(int)DB::table('cloud_egress_days')->sum('held'));
        $this->assertSame(1,DB::table('cloud_provider_exposures')->where('kind','egress_final_window_estimate')->count());
    }
    public function test_funded_ai_on_an_unlinked_chat_is_included_in_the_shared_session_limit(): void
    {
        $this->readyCompute(10000); $w=$this->row(); $chat=(string)Str::uuid();
        DB::table('vibes_chats')->insert(['id'=>$chat,'user_id'=>$w->user_id,'title'=>'AI','created_at'=>now(),'updated_at'=>now()]);
        $chat=DB::table('vibes_chats')->where('id',$chat)->first();
        $before=app(Budgets::class)->committed($w);
        $this->assertGreaterThan(0,$before); $this->assertLessThanOrEqual(10000,$before);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(Budgets::class)->guardAi($chat,10001-$before);
    }
    public function test_usage_cursor_does_not_drop_receipts_with_identical_timestamps(): void
    {
        for($i=0;$i<51;$i++) DB::table('cloud_reservations')->insert(['id'=>(string)Str::uuid(),'user_id'=>$this->user->id,'workspace_id'=>$this->cid,
            'generation'=>1,'reserved'=>1,'tariff_version'=>'test','units_per_hour'=>1,'allocations'=>'[]','charged'=>1,'settled_at'=>now(),'created_at'=>now(),'updated_at'=>now()]);
        $first=app(ComputeUsage::class)->payload($this->user->id); $next=app(ComputeUsage::class)->payload($this->user->id,$first['nextBefore']);
        $this->assertCount(50,$first['receipts']); $this->assertCount(1,$next['receipts']);
        $this->assertCount(51,array_unique(array_column([...$first['receipts'],...$next['receipts']],'id')));
    }
    public function test_foreground_activity_requires_current_host_trust_and_expires_after_background(): void
    {
        $this->readyCompute(); $host=$this->device->host;
        DB::table('cloud_workspaces')->where('id',$this->cid)->update(['remote_host_id'=>$host->id]);
        $this->device->forceFill(['permissions'=>['preview:access']])->save();
        $g=RemoteSession::create(['grant_id'=>(string)Str::uuid(),'user_id'=>$this->user->id,'app_session_id'=>$this->session->id,
            'remote_host_id'=>$host->id,'trusted_device_id'=>$this->device->id,'permissions'=>['preview:access'],'authorization_generation'=>$host->authorization_generation,'status'=>'CONNECTED','expires_at'=>now()->addHour(), 'issued_at'=>now()]);
        $d=['workspaceId'=>$this->cid,'generation'=>$this->row()->generation,'visible'=>true];
        $this->postJson('/api/cloud-computer/preview/activity',$d)->assertOk();
        $this->assertEqualsWithDelta(30,strtotime($this->row()->preview_active_until)-now()->timestamp,1);
        $this->postJson('/api/cloud-computer/preview/activity',[...$d,'visible'=>false])->assertOk(); $this->assertNull($this->row()->preview_active_until);
        $g->forceFill(['revoked_at'=>now()])->save(); $this->postJson('/api/cloud-computer/preview/activity',$d)->assertStatus(403);
    }
}
