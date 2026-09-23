<?php
namespace Tests\Feature;
use App\Models\{User,VibyraSession};
use App\Services\Notifications\{Inbox,Preferences};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
final class HostNotificationTest extends TestCase
{
    use RefreshDatabase;
    public function test_scoped_credentials_ignore_replays_and_revocation_blocks_events(): void
    {
        config(['intelligence.host_events'=>true,'intelligence.events'=>true,'intelligence.inbox'=>true]);
        $u=User::factory()->create();$host=str_repeat('a',64);
        $s=VibyraSession::create(['user_id'=>$u->id,'token_hash'=>hash('sha256','host-test'),
            'idle_expires_at'=>now()->addDay(),'absolute_expires_at'=>now()->addDays(2)]);
        DB::table('remote_hosts')->insert(['user_id'=>$u->id,'host_id'=>$host,'name'=>'Computer','registered_at'=>now()]);
        app(Preferences::class)->get($u->id);
        $token=$this->withToken('host-test')->postJson('/api/notifications/v1/host-credential',['hostId'=>$host])->assertOk()->json('token');
        $event=['sessionId'=>'s','generation'=>'g','turnId'=>'t','sequence'=>1,'occurredAt'=>now()->toIso8601String(),'phase'=>'approval_pending','secret'=>'never stored'];
        $post=fn($e)=>$this->withToken($token)->postJson('/api/notifications/v1/host-events',['events'=>[$e]]);
        $post($event)->assertOk();$post($event)->assertOk();$this->assertDatabaseCount('work_events',1);
        $this->assertStringNotContainsString('secret',DB::table('work_events')->value('metadata'));
        app(Inbox::class)->publish(DB::table('work_events')->value('id'));$item=DB::table('notification_items')->first();
        $this->assertTrue(app(Inbox::class)->current($item));
        $post([...$event,'sequence'=>2,'phase'=>'working'])->assertOk();$this->assertFalse(app(Inbox::class)->current($item));
        $s->revoke('logout');$post([...$event,'sequence'=>3])->assertUnauthorized();
        $this->withToken($token)->getJson('/api/vibes/wallet')->assertUnauthorized();
    }
}
