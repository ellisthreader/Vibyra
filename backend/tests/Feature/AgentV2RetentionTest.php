<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Artisan, DB, Storage};
use Illuminate\Support\Str;
use Tests\Support\{AgentV2Fixture, AgentV2Routes};
use Tests\TestCase;

/** F-04 (security review 2026-09-30): deleting an account leaves no Agent V2 data behind, and old journals and files age out. */
class AgentV2RetentionTest extends TestCase
{
    use RefreshDatabase, AgentV2Fixture, AgentV2Routes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bootV2();
        Storage::fake('local');
    }

    private function upload(string $text = 'Launch notes.'): array
    {
        return $this->post('/api/agents/v2/attachments', ['file' => UploadedFile::fake()->createWithContent('notes.md', $text)],
            ['Accept' => 'application/json'])->assertCreated()->json('attachment');
    }

    /** A finished run with an attachment, an approved write (receipt) and a journal. */
    private function finishedRun(string $key, ?array $attachment = null): array
    {
        $connection = $this->gmailInstall('owner@example.com');
        $this->grant($connection, ['gmail_read', 'gmail_search', 'gmail_send']);
        $this->fakeGmail(['gmail-token-a' => []]);
        $attachment ??= $this->upload();
        $run = $this->postJson('/api/agents/v2/runs', ['agentId' => $this->agent['id'], 'idempotencyKey' => 'send-'.$key,
            'prompt' => 'Email the notes to Sam.', 'attachments' => [['id' => $attachment['id']]]])->assertCreated()->json('run');
        $claimed = $this->claim();
        $action = $this->callTool($claimed, 'gmail_send', $connection, ['to' => 'sam@example.com', 'subject' => 'Notes', 'body' => 'Private body'], 'c-'.$key)->json('action');
        $this->decide($action)->assertOk();
        $this->postJson($this->runnerPath('/runs/'.$run['id'].'/complete'), ['generation' => $claimed['generation'], 'answer' => 'Sent.'],
            $this->runnerHeaders())->assertOk();
        return [$run, $attachment];
    }

    private function rowsFor(array $run, array $attachment): array
    {
        return ['runs' => DB::table('agent_runs')->where('id', $run['id'])->count(),
            'events' => DB::table('agent_run_events')->where('run_id', $run['id'])->count(),
            'receipts' => DB::table('agent_receipts')->where('run_id', $run['id'])->count(),
            'attachment rows' => DB::table('agent_v2_attachments')->where('id', $attachment['id'])->count()];
    }

    public function test_deleting_an_account_purges_files_journals_receipts_and_the_rest_of_its_v2_data(): void
    {
        [$run, $attachment] = $this->finishedRun('mine');
        $path = DB::table('agent_v2_attachments')->where('id', $attachment['id'])->value('path');
        Storage::disk('local')->assertExists($path);
        $item = (string) Str::uuid();
        $device = (string) Str::uuid();
        DB::table('notification_items')->insert(['id' => $item, 'user_id' => $this->user->id, 'event_id' => 901, 'category' => 'attention', 'title' => 'Needs you',
            'destination' => json_encode(['runId' => $run['id']]), 'created_at' => now(), 'expires_at' => now()->addDay()]);
        DB::table('notification_deliveries')->insert(['item_id' => $item, 'device_id' => $device, 'generation' => 1, 'state' => 'pending', 'next_at' => now(),
            'created_at' => now(), 'updated_at' => now()]);
        $this->postJson('/api/agents/v2/schedules', ['agentId' => $this->agent['id'], 'prompt' => 'Summarize.',
            'recurrence' => ['type' => 'daily', 'time' => '08:00'], 'timezone' => 'UTC'])->assertCreated();
        $this->postJson('/api/agents/v2/triggers', ['agentId' => $this->agent['id'], 'kind' => 'github.issue', 'promptTemplate' => 'Triage this new issue.',
            'filter' => ['repository' => 'acme/app', 'actions' => ['opened']]])->assertCreated();
        $other = $this->rowsFor(...$this->otherAccountsRun());

        $this->assertTrue($this->user->delete());

        Storage::disk('local')->assertMissing($path);
        $this->assertSame(['runs' => 0, 'events' => 0, 'receipts' => 0, 'attachment rows' => 0], $this->rowsFor($run, $attachment));
        foreach (['agent_tool_actions', 'agent_connections', 'agent_grants', 'agent_schedules', 'agent_triggers', 'agent_runtime_bindings',
            'agent_v2_attachments', 'notification_items'] as $table)
            $this->assertSame(0, DB::table($table)->where('user_id', $this->user->id)->count(), $table);
        $this->assertSame(0, DB::table('notification_deliveries')->where('item_id', $item)->count());
        $this->assertSame(0, DB::table('agent_run_events')->count() - $other['events'], 'Only the other account\'s journal is left.');
    }

    /** @return array{0: array, 1: array} a second account's finished run, which deletion must not touch */
    private function otherAccountsRun(): array
    {
        $first = [$this->user, $this->agent, $this->runtime, $this->hostId];
        $this->user = User::factory()->create();
        config(['agents_v2.user_ids' => '*']);
        \App\Models\VibyraSession::create(['user_id' => $this->user->id, 'token_hash' => hash('sha256', 'second'), 'device_name' => 'Mac']);
        $this->withToken('second');
        app(\App\Services\Vibes\Wallet::class)->ensure($this->user);
        $this->agent = app(\App\Services\Agents\Teammates::class)->save($this->user->id, ['id' => (string) Str::uuid(), 'name' => 'Other',
            'brief' => 'Help.', 'avatar' => 'assistant', 'budget' => 10, 'integrations' => []]);
        $this->hostId = str_repeat('d', 64);
        $this->runtime = $this->registerRuntime('acct-2');
        $pair = $this->finishedRun('theirs');
        [$this->user, $this->agent, $this->runtime, $this->hostId] = $first;
        $this->withToken('v2-session');
        return $pair;
    }

    public function test_the_retention_sweep_prunes_old_journals_and_files_but_not_recent_or_live_work(): void
    {
        config(['agents_v2.retention' => ['events_days' => 90, 'attachments_days' => 30, 'unattached_hours' => 48]]);
        [$old, $oldFile] = $this->finishedRun('old');
        DB::table('agent_runs')->where('id', $old['id'])->update(['finished_at' => now()->subDays(120)]);
        DB::table('agent_v2_attachments')->where('id', $oldFile['id'])->update(['created_at' => now()->subDays(121)]);
        [$recent, $recentFile] = $this->finishedRun('recent');
        DB::table('agent_runs')->where('id', $recent['id'])->update(['finished_at' => now()->subDays(10)]);
        DB::table('agent_v2_attachments')->where('id', $recentFile['id'])->update(['created_at' => now()->subDays(11)]);
        $live = $this->admit('Still going.');
        DB::table('agent_runs')->where('id', $live['id'])->update(['created_at' => now()->subDays(200)]);
        $stray = $this->upload('never attached');
        DB::table('agent_v2_attachments')->where('id', $stray['id'])->update(['created_at' => now()->subDays(3)]);
        $fresh = $this->upload('just uploaded');
        DB::table('agent_run_events')->insert(['run_id' => (string) Str::uuid(), 'seq' => 1, 'type' => 'status', 'payload' => '{}', 'source' => 'runner', 'created_at' => now()]);
        $oldPath = DB::table('agent_v2_attachments')->where('id', $oldFile['id'])->value('path');
        $recentPath = DB::table('agent_v2_attachments')->where('id', $recentFile['id'])->value('path');

        Artisan::call('vibyra:agent-v2-retention');

        $this->assertSame(['runs' => 1, 'events' => 0, 'receipts' => 1, 'attachment rows' => 0], $this->rowsFor($old, $oldFile), 'Receipts are the audit trail and stay.');
        Storage::disk('local')->assertMissing($oldPath);
        $this->assertGreaterThan(0, DB::table('agent_run_events')->where('run_id', $recent['id'])->count());
        Storage::disk('local')->assertExists($recentPath);
        $this->assertSame(0, DB::table('agent_v2_attachments')->where('id', $stray['id'])->count(), 'An upload nobody used goes after its grace period.');
        $this->assertSame(1, DB::table('agent_v2_attachments')->where('id', $fresh['id'])->count());
        $this->assertSame(0, DB::table('agent_run_events')->whereNotIn('run_id', DB::table('agent_runs')->select('id'))->count(), 'Orphaned journal rows are swept.');
        $this->assertGreaterThan(0, DB::table('agent_run_events')->where('run_id', $live['id'])->count());
        // Zero disables a class of pruning: nothing more is removed.
        config(['agents_v2.retention' => ['events_days' => 0, 'attachments_days' => 0, 'unattached_hours' => 0]]);
        Artisan::call('vibyra:agent-v2-retention');
        $this->assertSame(1, DB::table('agent_v2_attachments')->where('id', $fresh['id'])->count());
    }
}
