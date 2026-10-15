<?php
namespace Tests\Feature\CloudComputer;

use App\Models\User;
use App\Services\CloudComputer\Activity\HostEvents;
use App\Services\Privacy\ExportSections;
use Illuminate\Support\Facades\DB;

/** The Host's phase rows: capped per account on insert, and part of "Download my data" with the owner records' minimisation. */
class ActivityCapExportTest extends ActivityTestCase
{
    private function fill(int $user, int $n, string $prefix = 'seed'): void
    {
        $rows = [];
        for ($i = 0; $i < $n; $i++) {
            // Oldest first, all inside the seven days: a second apart, ending an hour ago.
            $rows[] = ['user_id' => $user, 'provider' => 'codex', 'agent_session_id' => $prefix.'-'.$i, 'project' => 'my-app', 'phase' => 'finished',
                'at' => HostEvents::stamp(now()->subHour()->subSeconds($n - $i)), 'created_at' => now()];
        }
        foreach (array_chunk($rows, 500) as $chunk) DB::table('cloud_host_events')->insert($chunk);
    }

    public function test_an_account_keeps_at_most_the_cap_and_the_oldest_rows_go_on_insert(): void
    {
        $token = $this->liveComputer();
        $other = User::factory()->create(['email_verified_at' => now()]);
        $this->fill($other->id, 5, 'theirs');
        $this->fill($this->user->id, HostEvents::MAX_PER_USER);
        $this->assertSame(HostEvents::MAX_PER_USER, DB::table('cloud_host_events')->where('user_id', $this->user->id)->count());
        $this->report($token, [$this->ev(self::A, 'running', now()->subSeconds(20)->toIso8601String()), $this->ev(self::A, 'waiting', now()->subSeconds(10)->toIso8601String())])
            ->assertOk()->assertJsonPath('accepted', 2);
        $mine = DB::table('cloud_host_events')->where('user_id', $this->user->id);
        $this->assertSame(HostEvents::MAX_PER_USER, (clone $mine)->count());
        $this->assertSame([], (clone $mine)->whereIn('agent_session_id', ['seed-0', 'seed-1'])->pluck('agent_session_id')->all(), 'the two oldest made room');
        $this->assertSame(1, (clone $mine)->where('agent_session_id', 'seed-2')->count());
        $this->assertSame(['running', 'waiting'], (clone $mine)->where('agent_session_id', self::A)->orderBy('at')->pluck('phase')->all());
        $this->assertSame(5, DB::table('cloud_host_events')->where('user_id', $other->id)->count(), 'another account is never trimmed');
        $this->assertSame(['waiting'], array_column($this->feed()->json('running'), 'phase'), 'the live list still reads the newest phase');
        // A replay of what is stored is a duplicate and trims nothing.
        $at = DB::table('cloud_host_events')->where('agent_session_id', self::A)->where('phase', 'waiting')->value('at');
        $this->report($token, [$this->ev(self::A, 'waiting', \Illuminate\Support\Carbon::parse($at, 'UTC')->toIso8601String())])->assertOk()->assertJsonPath('duplicates', 1);
        $this->assertSame(HostEvents::MAX_PER_USER, DB::table('cloud_host_events')->where('user_id', $this->user->id)->count());
    }

    public function test_download_my_data_lists_phase_rows_without_conversation_ids(): void
    {
        $token = $this->liveComputer();
        $this->report($token, [$this->ev(self::A, 'finished', null, 'claude', 'my-app', "Fix the\nlogin bug")])->assertOk();
        $all = iterator_to_array((new ExportSections())->for($this->user)['projects.json'], false);
        $rows = array_values(array_filter($all, fn ($r) => $r['kind'] === 'cloud-host-event'));
        $this->assertCount(1, $rows);
        $this->assertSame(['kind', 'provider', 'project', 'phase', 'title', 'at'], array_keys($rows[0]));
        $this->assertSame(['claude', 'my-app', 'finished', 'Fix the login bug'], [$rows[0]['provider'], $rows[0]['project'], $rows[0]['phase'], $rows[0]['title']]);
        $this->assertStringNotContainsString(self::A, json_encode($rows));
        $this->assertStringNotContainsString(HostEvents::cardId($this->user->id, 'claude', self::A), json_encode($rows));
    }
}
