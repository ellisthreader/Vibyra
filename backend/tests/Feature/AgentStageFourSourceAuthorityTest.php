<?php
namespace Tests\Feature;

use App\Models\AgentV2\{Connection, Grant, Trigger};
use App\Models\AgentWork\FollowUp;
use App\Services\AgentTriggers\{Pollers, TriggerIntake};
use App\Services\AgentWork\{FollowUpAuthority, FollowUpProgress, FollowUpSources};
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\{DB, Http};
use Tests\Support\AgentV2Routes;

final class AgentStageFourSourceAuthorityTest extends AgentWorkTestCase
{
    use AgentV2Routes;

    private function gmailSource(): Trigger
    {
        $connection = $this->gmailInstall('owner@example.com'); $this->grant($connection, ['gmail_search']);
        $id = $this->postJson('/api/agents/v2/triggers', ['agentId' => $this->agent['id'], 'runtimeId' => $this->runtime['id'],
            'kind' => 'gmail.message', 'connectionId' => $connection, 'promptTemplate' => 'Read the new message.'])
            ->assertCreated()->json('trigger.id');
        $t = Trigger::findOrFail($id);
        app(TriggerIntake::class)->receive($t, 'gmail:seed', 'gmail.message', ['threadId' => 'thread1']);
        return $t;
    }

    private function absence(Trigger $t): array
    {
        return $this->follow(['kind' => 'absence', 'triggerId' => $t->id, 'triggerRevision' => $t->revision,
            'subject' => 'gmail:thread:thread1', 'at' => now()->addMinutes(2)->toIso8601String()]);
    }

    public function test_reconnected_account_cannot_inherit_subjects_or_admit_an_old_followup(): void
    {
        $t = $this->gmailSource(); $f = $this->absence($t); $old = FollowUpAuthority::snapshot($t);
        Connection::whereKey($t->connection_id)->increment('generation');
        app(TriggerIntake::class)->receive($t, 'gmail:stale-read', 'gmail.message', ['threadId' => 'thread2'], null, null, $old);
        $this->assertSame([], app(FollowUpSources::class)->subjects($t));
        $this->assertSame(1, DB::table('agent_work_signals')->count());
        $this->travel(3)->minutes(); app(FollowUpProgress::class)->tick();
        $this->assertSame('blocked', FollowUp::find($f['id'])->status); $this->assertNull(FollowUp::find($f['id'])->run_id);
    }

    public function test_read_grant_revision_and_trigger_revision_invalidate_old_observations(): void
    {
        $t = $this->gmailSource(); $f = $this->absence($t);
        Grant::where('connection_id', $t->connection_id)->increment('revision');
        $this->assertSame([], app(FollowUpSources::class)->subjects($t));
        app(FollowUpProgress::class)->tick(); $this->assertSame('blocked', FollowUp::find($f['id'])->status);
        Trigger::whereKey($t->id)->increment('revision');
        app(TriggerIntake::class)->receive($t, 'gmail:stale-trigger', 'gmail.message', ['threadId' => 'thread3']);
        $this->assertSame([], app(FollowUpSources::class)->subjects($t->fresh()));
        $this->assertSame(1, DB::table('agent_work_signals')->count());
    }

    public function test_missing_thread_metadata_cannot_prove_absence(): void
    {
        $t = $this->gmailSource(); $t->forceFill(['cursor' => ['after' => now()->subMinute()->timestamp]])->save();
        $f = $this->absence($t);
        $this->route('GET', '#gmail\.googleapis\.com/gmail/v1/users/me/messages(?:\?|$)#', Http::response(['messages' => [['id' => 'm2']]]));
        $this->route('GET', '#gmail\.googleapis\.com/gmail/v1/users/me/messages/m2#', Http::response(['payload' => ['headers' => []]]));
        $this->travel(3)->minutes();
        app(Pollers::class)->poll($t->fresh(), CarbonImmutable::now()); app(FollowUpProgress::class)->tick();
        $this->assertNull(FollowUp::find($f['id'])->run_id);
        $this->assertFalse((bool) DB::table('agent_work_observations')->value('complete'));
        $this->assertSame('waiting_for_fresh_source', FollowUp::find($f['id'])->reason);
    }

    public function test_partial_poll_never_proves_absence_and_retains_window_until_complete_read(): void
    {
        $t = $this->gmailSource(); $t->forceFill(['cursor' => ['after' => now()->subMinute()->timestamp]])->save();
        $f = $this->absence($t); $start = $t->cursor;
        $partial = true;
        $this->route('GET', '#gmail\.googleapis\.com/gmail/v1/users/me/messages(?:\?|$)#', function () use (&$partial) {
            return Http::response($partial ? ['messages' => [], 'nextPageToken' => 'more'] : ['messages' => []]);
        });
        $this->travel(3)->minutes(); DB::table('agent_runtime_bindings')->update(['last_seen_at' => now()]);
        app(Pollers::class)->poll($t->fresh(), CarbonImmutable::now()); app(FollowUpProgress::class)->tick();
        $this->assertSame($start, $t->fresh()->cursor); $this->assertNull(FollowUp::find($f['id'])->run_id);
        $this->assertSame('waiting_for_fresh_source', FollowUp::find($f['id'])->reason);
        $partial = false;
        app(Pollers::class)->poll($t->fresh(), CarbonImmutable::now()); app(FollowUpProgress::class)->tick();
        $this->assertNotNull(FollowUp::find($f['id'])->run_id);
        $this->assertTrue((bool) DB::table('agent_work_observations')->value('complete'));
    }
}
