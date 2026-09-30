<?php

namespace Tests\Feature;

use App\Jobs\DeliverPhoneNotification;
use App\Models\{User, VibyraSession};
use App\Models\AgentV2\{Run, RunEvent};
use App\Services\AgentRuns\Events;
use App\Services\Notifications\{AgentRunNotifications, Devices};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Http, Queue};
use Illuminate\Support\Str;
use Tests\Support\AgentV2Fixture;
use Tests\TestCase;

/** Phase 3: the four Agent V2 run hooks become private inbox items and a push outbox. */
class AgentV2NotificationTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture;

    private const SEND = ['to' => 'private-recipient@example.com', 'subject' => 'Secret plans', 'body' => 'Confidential body.'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->startOfSecond());
        $this->bootV2();
        Queue::fake();
        config(['agents_v2.notifications' => true, 'intelligence.inbox' => true, 'intelligence.push' => true,
            'intelligence.expo_project' => '00000000-0000-4000-8000-000000000001']);
    }

    private function device(): string
    {
        $session = VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'phone-session'),
            'idle_expires_at' => now()->addDay(), 'absolute_expires_at' => now()->addDays(2)]);
        return app(Devices::class)->register($session, ['installation' => (string) Str::uuid(), 'proof' => str_repeat('p', 64),
            'token' => 'ExpoPushToken[fixture]', 'environment' => 'development', 'projectId' => config('intelligence.expo_project')])['id'];
    }

    private function pendingApproval(): array
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $run = $this->admit('Email my secret plans to the board.');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $connection, self::SEND, 'call-send')->assertOk()
            ->assertJsonPath('action.state', 'pending_approval')->json('action');
        return [$run, $action, $claimed];
    }

    public function test_approval_hook_creates_item_and_outbox_with_the_event(): void
    {
        $device = $this->device();
        [$run, $action] = $this->pendingApproval();
        $item = DB::table('notification_items')->where('user_id', $this->user->id)->sole();
        $this->assertSame('Your teammate needs approval', $item->title);
        $this->assertSame('attention', $item->category);
        $this->assertSame(['source' => 'agent_run', 'runId' => $run['id'], 'agentId' => $this->agent['id'],
            'conversationId' => $run['conversationId'], 'kind' => 'approval'], json_decode($item->destination, true));
        $this->assertDatabaseHas('notification_deliveries', ['item_id' => $item->id, 'device_id' => $device, 'state' => 'pending']);
        $this->assertDatabaseHas('work_events', ['source' => 'agent_run', 'run_id' => $run['id'], 'phase' => 'agent_approval']);
        Queue::assertPushed(DeliverPhoneNotification::class, 1);
        $this->assertTrue(json_decode(DB::table('work_events')->where('source', 'agent_run')->value('metadata'), true)['actionId'] === $action['id']);
    }

    public function test_outbox_rows_roll_back_with_the_journal_event(): void
    {
        $this->device();
        [$run] = $this->pendingApproval();
        DB::table('notification_items')->delete();
        $model = Run::query()->findOrFail($run['id']);
        try {
            DB::transaction(function () use ($model) {
                app(Events::class)->append($model, 'run.failed', ['code' => 'x']);
                throw new \RuntimeException('abort');
            });
        } catch (\RuntimeException) {}
        $this->assertDatabaseMissing('agent_run_events', ['run_id' => $run['id'], 'type' => 'run.failed']);
        $this->assertSame(0, DB::table('notification_items')->count());
        $this->assertSame(0, DB::table('work_events')->where('phase', 'agent_failed')->count());
    }

    public function test_push_payload_is_opaque_and_generic(): void
    {
        $this->device();
        [$run, $action] = $this->pendingApproval();
        Http::fake(['exp.host/*' => Http::response(['data' => ['status' => 'ok', 'id' => 'ticket']])]);
        (new DeliverPhoneNotification(DB::table('notification_deliveries')->value('id')))->handle();
        $item = DB::table('notification_items')->sole();
        Http::assertSent(function ($r) use ($item, $run, $action) {
            if (!str_contains($r->url(), 'exp.host')) return false;
            $json = json_encode($r->data());
            foreach (['Secret', 'Confidential', 'private-recipient', 'owner@example.com', $run['id'], $action['id'], $this->agent['id']] as $private)
                if (str_contains($json, $private)) return false;
            return $r['title'] === 'Your teammate needs approval' && $r['data'] === ['version' => 1, 'notificationId' => $item->id];
        });
    }

    public function test_same_event_twice_is_one_item_and_one_delivery_per_device(): void
    {
        $this->device();
        [$run] = $this->pendingApproval();
        $event = RunEvent::query()->where('run_id', $run['id'])->where('type', 'run.waiting_approval')->sole();
        app(AgentRunNotifications::class)->record($event);
        app(AgentRunNotifications::class)->record($event);
        $this->assertSame(1, DB::table('notification_items')->count());
        $this->assertSame(1, DB::table('notification_deliveries')->count());
        $this->assertSame(1, DB::table('work_events')->where('source', 'agent_run')->count());
    }

    public function test_destination_is_owner_only_and_reports_current_state_without_approving(): void
    {
        [$run, $action] = $this->pendingApproval();
        $id = DB::table('notification_items')->value('id');
        $this->getJson('/api/notifications/v1/inbox/'.$id)->assertOk()
            ->assertJsonPath('item.destination.agentId', $this->agent['id'])->assertJsonPath('item.destination.runId', $run['id'])
            ->assertJsonPath('item.actionable', true)->assertJsonPath('item.status.runState', 'waiting_for_approval')
            ->assertJsonPath('item.status.actionState', 'pending_approval')->assertJsonMissingPath('item.status.fingerprint');
        $this->travel(config('agents_v2.approval_seconds') + 1)->seconds();
        $this->getJson('/api/notifications/v1/inbox/'.$id)->assertOk()
            ->assertJsonPath('item.actionable', false)->assertJsonPath('item.status.actionState', 'expired');
        $this->assertDatabaseHas('agent_tool_actions', ['id' => $action['id'], 'state' => 'pending_approval']);
        Http::assertNotSent(fn ($r) => str_contains($r->url(), '/messages/send'));
        $other = User::factory()->create();
        VibyraSession::create(['user_id' => $other->id, 'token_hash' => hash('sha256', 'intruder')]);
        $this->withToken('intruder')->getJson('/api/notifications/v1/inbox/'.$id)->assertNotFound();
    }

    public function test_completed_run_notifies_replies(): void
    {
        $this->admit('Summarize.');
        $claimed = $this->claim();
        $this->postJson($this->runnerPath('/runs/'.$claimed['id'].'/complete'), ['generation' => $claimed['generation'],
            'answer' => 'Private answer.'], $this->runnerHeaders())->assertOk();
        $item = DB::table('notification_items')->sole();
        $this->assertSame(['replies', 'Your teammate finished'], [$item->category, $item->title]);
        $this->assertStringNotContainsString('Private', $item->destination);
    }

    public function test_flag_off_creates_nothing(): void
    {
        config(['agents_v2.notifications' => false]);
        $this->device();
        $this->pendingApproval();
        $this->assertSame(0, DB::table('notification_items')->count());
        $this->assertSame(0, DB::table('notification_deliveries')->count());
        $this->assertSame(0, DB::table('work_events')->where('source', 'agent_run')->count());
        Queue::assertNothingPushed();
    }
}
